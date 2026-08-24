import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionSummary, SmithEvent } from "./protocol";
import type { Workspace } from "./workspace";

export const SESSION_DIRECTORY = ".smith/sessions";
const SESSION_VERSION = 1;
const MAX_SESSION_BYTES = 8 * 1024 * 1024;
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/iu;

export interface SessionRecord {
  version: 1;
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentMessage[];
  history: SmithEvent[];
  promptMessageStarts: Record<string, number>;
}


export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPromptMessageStarts(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((start) => typeof start === "number" && Number.isInteger(start) && start >= 0);
}

function fallbackMessageStart(record: SessionRecord, historyIndex: number): number {
  const promptOrdinal = record.history
    .slice(0, historyIndex + 1)
    .filter((event) => event.type === "prompt_start").length - 1;
  let seenPrompts = 0;
  for (let index = 0; index < record.messages.length; index += 1) {
    const message = record.messages[index] as unknown as { role?: unknown };
    if (message.role !== "user") continue;
    if (seenPrompts === promptOrdinal) return index;
    seenPrompts += 1;
  }
  throw new SessionError(`Cannot find the Pi message boundary for prompt ${record.history[historyIndex]?.type === "prompt_start" ? record.history[historyIndex].promptId : ""}.`);
}

export function branchSessionRecord(record: SessionRecord, promptId: string): void {
  const historyIndex = record.history.findIndex((event) => event.type === "prompt_start" && event.promptId === promptId);
  if (historyIndex < 0) throw new SessionError(`Prompt not found in session: ${promptId}`);
  const recordedStart = record.promptMessageStarts[promptId];
  const messageStart = recordedStart ?? fallbackMessageStart(record, historyIndex);
  if (!Number.isInteger(messageStart) || messageStart < 0 || messageStart > record.messages.length) {
    throw new SessionError(`Invalid Pi message boundary for prompt: ${promptId}`);
  }

  record.history = record.history.slice(0, historyIndex);
  record.messages = record.messages.slice(0, messageStart);
  record.promptMessageStarts = Object.fromEntries(
    Object.entries(record.promptMessageStarts).filter(([, start]) => start < messageStart),
  );
}

export class SessionStore {
  private readonly directory: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly workspace: Workspace) {
    this.directory = workspace.resolvePath(SESSION_DIRECTORY);
  }

  async create(modelId: string): Promise<SessionRecord> {
    await this.ensureDirectory();
    const now = Date.now();
    const record: SessionRecord = {
      version: SESSION_VERSION,
      id: randomUUID(),
      title: "New session",
      modelId,
      createdAt: now,
      updatedAt: now,
      messages: [],
      history: [],
      promptMessageStarts: {},
    };
    await this.write(record);
    return record;
  }

  async latest(): Promise<SessionRecord | undefined> {
    const sessions = await this.listRecords();
    return sessions[0];
  }

  async list(): Promise<SessionSummary[]> {
    const records = await this.listRecords();
    return records.map((record) => this.summary(record));
  }

  async load(id: string): Promise<SessionRecord> {
    const record = await this.read(id);
    return record;
  }

  async save(record: SessionRecord): Promise<void> {
    record.updatedAt = Date.now();
    await this.ensureDirectory();
    await this.write(record);
  }

  async setTitle(record: SessionRecord, title: string): Promise<void> {
    const normalized = title.replace(/\s+/gu, " ").trim();
    if (!normalized) throw new SessionError("Session title must not be empty.");
    const nextTitle = normalized.slice(0, 160);
    if (record.title === nextTitle) return;
    record.title = nextTitle;
    await this.save(record);
  }

  async delete(id: string): Promise<void> {
    await this.read(id);
    await this.writeQueue;
    try {
      await unlink(join(this.directory, `${id}.json`));
    } catch (error) {
      throw new SessionError(`Could not delete session ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async listRecords(): Promise<SessionRecord[]> {
    await this.ensureDirectory();
    let entries;
    try {
      entries = await readdir(this.directory, { withFileTypes: true });
    } catch (error) {
      throw new SessionError(`Could not list sessions: ${error instanceof Error ? error.message : String(error)}`);
    }

    const records: SessionRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      records.push(await this.read(entry.name.slice(0, -5)));
    }
    return records.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  private async read(id: string): Promise<SessionRecord> {
    if (!SESSION_ID_PATTERN.test(id)) throw new SessionError(`Invalid session id: ${id}`);
    const path = join(this.directory, `${id}.json`);
    let info;
    try {
      info = await stat(path);
    } catch {
      throw new SessionError(`Session not found: ${id}`);
    }
    if (!info.isFile()) throw new SessionError(`Session is not a file: ${id}`);
    if (info.size > MAX_SESSION_BYTES) throw new SessionError(`Session exceeds the ${MAX_SESSION_BYTES}-byte limit: ${id}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      throw new SessionError(`Invalid session ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!this.isSessionRecord(parsed)) throw new SessionError(`Invalid session data: ${id}`);
    return {
      ...parsed,
      history: parsed.history ?? [],
      promptMessageStarts: parsed.promptMessageStarts ?? {},
    };
  }

  private write(record: SessionRecord): Promise<void> {
    const path = join(this.directory, `${record.id}.json`);
    const temporaryPath = `${path}.${randomUUID()}.tmp`;
    const content = `${JSON.stringify(record, null, 2)}\n`;
    if (new TextEncoder().encode(content).byteLength > MAX_SESSION_BYTES) {
      return Promise.reject(new SessionError(`Session exceeds the ${MAX_SESSION_BYTES}-byte limit: ${record.id}`));
    }
    const operation = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          await writeFile(temporaryPath, content, "utf8");
          await rename(temporaryPath, path);
        } catch (error) {
          throw new SessionError(`Could not save session ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async ensureDirectory(): Promise<void> {
    try {
      await mkdir(this.directory, { recursive: true });
    } catch (error) {
      throw new SessionError(`Could not create the session directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private summary(record: SessionRecord): SessionSummary {
    return {
      id: record.id,
      title: record.title,
      modelId: record.modelId,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      messageCount: record.messages.length,
    };
  }

  private isSessionRecord(value: unknown): value is SessionRecord {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Partial<SessionRecord>;
    return record.version === SESSION_VERSION
      && typeof record.id === "string"
      && SESSION_ID_PATTERN.test(record.id)
      && typeof record.title === "string"
      && typeof record.modelId === "string"
      && typeof record.createdAt === "number"
      && typeof record.updatedAt === "number"
      && Array.isArray(record.messages)
      && (record.history === undefined || Array.isArray(record.history))
      && (record.promptMessageStarts === undefined || isPromptMessageStarts(record.promptMessageStarts));
  }
}
