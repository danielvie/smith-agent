import { mkdir, open, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionSummary, SmithEvent } from "./protocol";
import type { Workspace } from "./workspace";

export const SESSION_DIRECTORY = ".smith/sessions";
const SESSION_VERSION = 1;
const MAX_SESSION_BYTES = 64 * 1024 * 1024;
const SESSION_ID_PATTERN = /^[0-9a-f-]{36}$/iu;
const RENAME_RETRY_DELAYS_MS = [25, 50, 100, 200, 400];

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
  private readonly locks = new Map<string, { handle: FileHandle; token: string }>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly workspace: Workspace) {
    this.directory = workspace.resolvePath(SESSION_DIRECTORY);
  }

  async create(modelId: string): Promise<SessionRecord> {
    await this.ensureDirectory();
    const record = this.newRecord(modelId);
    await this.write(record);
    return record;
  }

  async latest(): Promise<SessionRecord | undefined> {
    const sessions = await this.listRecords();
    return sessions[0];
  }

  async openLatestOrCreate(modelId: string): Promise<SessionRecord> {
    const latest = await this.latest();
    if (latest && await this.claim(latest.id)) return latest;
    return this.createAndOpen(modelId);
  }

  async createAndOpen(modelId: string): Promise<SessionRecord> {
    const record = this.newRecord(modelId);
    if (!await this.claim(record.id)) throw new SessionError(`Could not open new session: ${record.id}`);
    try {
      await this.write(record);
      return record;
    } catch (error) {
      await this.release(record.id);
      throw error;
    }
  }

  async resume(id: string): Promise<SessionRecord> {
    if (!await this.claim(id)) throw new SessionError(`Session is already open in another Smith instance: ${id}`);
    try {
      return await this.read(id);
    } catch (error) {
      await this.release(id);
      throw error;
    }
  }

  async release(id: string): Promise<void> {
    const lock = this.locks.get(id);
    if (!lock) return;
    this.locks.delete(id);
    await lock.handle.close();
    try {
      if (await readFile(this.lockPath(id), "utf8") === lock.token) await unlink(this.lockPath(id));
    } catch {
      // Another process may have recovered a stale lock after this process exited.
    }
  }

  async close(): Promise<void> {
    await Promise.all([...this.locks.keys()].map((id) => this.release(id)));
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
      await this.release(id);
    } catch (error) {
      throw new SessionError(`Could not delete session ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private newRecord(modelId: string): SessionRecord {
    const now = Date.now();
    return {
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
  }

  private async claim(id: string): Promise<boolean> {
    if (!SESSION_ID_PATTERN.test(id)) throw new SessionError(`Invalid session id: ${id}`);
    if (this.locks.has(id)) return true;
    await this.ensureDirectory();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const token = `${process.pid}:${randomUUID()}`;
      try {
        const handle = await open(this.lockPath(id), "wx");
        await handle.writeFile(token, "utf8");
        this.locks.set(id, { handle, token });
        return true;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if (code !== "EEXIST") throw new SessionError(`Could not open session ${id}: ${error instanceof Error ? error.message : String(error)}`);
        if (await this.lockHasLiveOwner(id)) return false;
        try {
          await unlink(this.lockPath(id));
        } catch (unlinkError) {
          const unlinkCode = unlinkError && typeof unlinkError === "object" && "code" in unlinkError ? unlinkError.code : undefined;
          if (unlinkCode !== "ENOENT") throw new SessionError(`Could not recover session lock ${id}: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`);
        }
      }
    }
    return false;
  }

  private async lockHasLiveOwner(id: string): Promise<boolean> {
    let token: string;
    try {
      token = await readFile(this.lockPath(id), "utf8");
    } catch {
      return false;
    }
    const pid = Number(token.split(":", 1)[0]);
    if (!Number.isInteger(pid) || pid < 1) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      return code !== "ESRCH";
    }
  }

  private lockPath(id: string): string {
    return join(this.directory, `${id}.lock`);
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
          await this.renameWithRetry(temporaryPath, path);
        } catch (error) {
          throw new SessionError(`Could not save session ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          await unlink(temporaryPath).catch(() => undefined);
        }
      });
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  private async renameWithRetry(source: string, destination: string): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        await rename(source, destination);
        return;
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        if ((code !== "EPERM" && code !== "EACCES") || attempt >= RENAME_RETRY_DELAYS_MS.length) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, RENAME_RETRY_DELAYS_MS[attempt]));
      }
    }
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
