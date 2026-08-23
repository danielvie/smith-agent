import { randomUUID } from "node:crypto";
import index from "./web/index.html";
import { ApprovalManager } from "./approval";
import { loadApprovalPolicy } from "./approval-policy";
import { DEFAULT_MODEL_ID, SmithAgentSession } from "./agent";
import { branchSessionRecord, SessionStore, type SessionRecord } from "./session";
import { connectConfiguredChromeDevToolsMcp } from "./mcp";
import { DEFAULT_CONFIG_PATH, loadSmithConfig } from "./config";
import { DEFAULT_MCP_CONFIG_PATH, loadMcpConfig } from "./mcp-config";
import type { ApprovalDecision, ApprovalState, McpServerState, QueuedPrompt, SessionSummary, SmithEvent, UiEvent, UiStateEvent } from "./protocol";
import { openWorkspace, type Workspace } from "./workspace";

export const DEFAULT_UI_PORT = 3210;
const MAX_REQUEST_BODY_BYTES = 64 * 1024;

type EventController = ReadableStreamDefaultController<Uint8Array>;

class SseHub {
  private readonly clients = new Set<EventController>();
  private readonly encoder = new TextEncoder();
  private readonly keepAlive = setInterval(() => this.publishComment(), 15_000);

  constructor(private readonly state: () => UiStateEvent) {}

  response(): Response {
    let current: EventController | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start: (controller) => {
        current = controller;
        this.clients.add(controller);
        controller.enqueue(this.encode(this.state()));
      },
      cancel: () => {
        if (current) this.clients.delete(current);
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  }

  publish(event: UiEvent): void {
    const packet = this.encode(event);
    for (const client of this.clients) {
      try {
        client.enqueue(packet);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  close(): void {
    clearInterval(this.keepAlive);
    for (const client of this.clients) {
      try {
        client.close();
      } catch {
        // The browser may already have closed the stream.
      }
    }
    this.clients.clear();
  }

  private publishComment(): void {
    const packet = this.encoder.encode(": keep-alive\n\n");
    for (const client of this.clients) {
      try {
        client.enqueue(packet);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  private encode(event: UiEvent): Uint8Array {
    return this.encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  }
}

export interface UiServerOptions {
  workspacePath?: string;
  configPath?: string;
  mcpConfigPath?: string;
  sessionId?: string;
  newSession?: boolean;
  port?: number;
}

export interface UiServerHandle {
  readonly url: string;
  readonly workspace: Workspace;
  readonly session: SmithAgentSession;
  readonly approvals: ApprovalManager;
  stop(): void;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function requestBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BODY_BYTES) {
    throw new Error("Request body is too large.");
  }
  const value: unknown = text ? JSON.parse(text) : {};
  if (!isRecord(value)) throw new Error("Request body must be a JSON object.");
  return value;
}

function messageFrom(body: Record<string, unknown>): string {
  if (typeof body.message !== "string" || !body.message.trim()) throw new Error("message must be a non-empty string.");
  if (body.message.length > 16_000) throw new Error("message exceeds the 16000-character limit.");
  return body.message;
}

function stateEvent(workspace: Workspace, model: string, configPath: string, sessionId: string, sessions: SessionSummary[], history: SmithEvent[], running: boolean, approvals: ApprovalState[], queuedPrompts: QueuedPrompt[], mcpServers: McpServerState[]): UiStateEvent {
  return {
    type: "state",
    workspace: workspace.root,
    model,
    configPath,
    sessionId,
    sessions: sessions.map((session) => ({ ...session })),
    history: history.map((event) => ({ ...event })),
    running,
    approvals,
    queuedPrompts: queuedPrompts.map((prompt) => ({ ...prompt })),
    mcpServers: mcpServers.map((server) => ({ ...server })),
  };
}


export async function startUiServer(options: UiServerOptions = {}): Promise<UiServerHandle> {
  const workspace = await openWorkspace(options.workspacePath ?? process.cwd());
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const mcpConfigPath = options.mcpConfigPath ?? DEFAULT_MCP_CONFIG_PATH;
  const config = await loadSmithConfig(workspace, configPath);
  const mcpConfig = await loadMcpConfig(workspace, mcpConfigPath);
  const approvalPolicy = await loadApprovalPolicy(workspace);
  const modelId = process.env.SMITH_MODEL?.trim() || config.model;
  const selectedModelId = modelId ?? DEFAULT_MODEL_ID;
  const sessionStore = new SessionStore(workspace);
  const sessionRecord = options.newSession
    ? await sessionStore.create(selectedModelId)
    : options.sessionId
      ? await sessionStore.load(options.sessionId)
      : await sessionStore.latest() ?? await sessionStore.create(selectedModelId);
  let activeSessionRecord: SessionRecord = sessionRecord;
  let sessionSummaries = await sessionStore.list();
  const approvals = new ApprovalManager(approvalPolicy);
  const chromeServer = mcpConfig.mcpServers?.["chrome-devtools"];
  const chromeMcp = chromeServer && chromeServer.enabled !== false
    ? await connectConfiguredChromeDevToolsMcp(chromeServer, workspace.root)
    : undefined;
  let session!: SmithAgentSession;
  let unsubscribeSession: () => void = () => {};
  let running = false;
  let activeRun: Promise<void> | undefined;
  let stopped = false;
  const queuedPrompts: QueuedPrompt[] = [];
  const mcpServers: McpServerState[] = chromeMcp ? [{ name: "chrome-devtools", toolCount: chromeMcp.tools.length }] : [];
  let events: SseHub;

  const currentState = () => stateEvent(workspace, session.modelId, configPath, activeSessionRecord.id, sessionSummaries, activeSessionRecord.history, running, approvals.list(), queuedPrompts, mcpServers);
  events = new SseHub(currentState);

  const createSession = (record: SessionRecord): SmithAgentSession => SmithAgentSession.create({
    workspace,
    modelId: record.modelId,
    sessionId: record.id,
    messages: record.messages,
    approve: approvals.request,
    extraTools: chromeMcp?.tools,
    protectedToolKinds: chromeMcp?.protectedToolKinds,
    onMessagesChange: async (messages) => {
      record.messages = messages;
      await sessionStore.save(record);
      sessionSummaries = await sessionStore.list();
      events.publish(currentState());
    },
  });

  const attachSession = (record: SessionRecord): void => {
    unsubscribeSession();
    activeSessionRecord = record;
    session = createSession(record);
    unsubscribeSession = session.subscribe((event) => {
      record.history.push(event);
      events.publish(event);
    });
    events.publish(currentState());
  };

  try {
    attachSession(sessionRecord);
  } catch (error) {
    await chromeMcp?.close();
    throw error;
  }
  approvals.subscribe((event) => events.publish(event));

  const runPrompt = (prompt: QueuedPrompt): void => {
    running = true;
    if (activeSessionRecord.title === "New session") void sessionStore.setTitle(activeSessionRecord, prompt.message);
    const promptStart: SmithEvent = { type: "prompt_start", promptId: prompt.id, message: prompt.message };
    activeSessionRecord.promptMessageStarts[prompt.id] = session.messageCount;
    activeSessionRecord.history.push(promptStart);
    events.publish(promptStart);
    events.publish(currentState());
    const run = Promise.resolve().then(() => session.prompt(prompt.message)).catch((error: unknown) => {
      events.publish({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
    activeRun = run.finally(() => {
      activeRun = undefined;
      if (stopped) {
        queuedPrompts.length = 0;
        running = false;
        return;
      }
      const next = queuedPrompts.shift();
      if (next) {
        runPrompt(next);
        return;
      }
      running = false;
      events.publish(currentState());
    });
    void activeRun;
  };

  const submitPrompt = (message: string): { accepted: true; queued: boolean; id: string } => {
    const prompt: QueuedPrompt = { id: randomUUID(), message, createdAt: Date.now() };
    if (activeRun) {
      queuedPrompts.push(prompt);
      events.publish(currentState());
      return { accepted: true, queued: true, id: prompt.id };
    }
    runPrompt(prompt);
    return { accepted: true, queued: false, id: prompt.id };
  };

  const cancelQueuedPrompt = (queueId: string): boolean => {
    const index = queuedPrompts.findIndex((prompt) => prompt.id === queueId);
    if (index < 0) return false;
    queuedPrompts.splice(index, 1);
    events.publish(currentState());
    return true;
  };

  const port = options.port ?? Number(process.env.SMITH_UI_PORT ?? DEFAULT_UI_PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("UI port must be an integer between 0 and 65535.");

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    routes: { "/": index },
    async fetch(request) {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/events") return events.response();
      if (request.method === "GET" && url.pathname === "/api/state") return json(currentState());
      if (request.method === "GET" && url.pathname === "/api/sessions") return json({ sessions: sessionSummaries, activeSessionId: activeSessionRecord.id });

      if (request.method !== "POST") return json({ error: "Not found" }, 404);

      try {
        const body = await requestBody(request);
        if (url.pathname === "/api/prompt") {
          return json(submitPrompt(messageFrom(body)), 202);
        }

        if (url.pathname === "/api/session/new") {
          if (activeRun) return json({ error: "Cannot switch sessions while a run is active." }, 409);
          const record = await sessionStore.create(selectedModelId);
          attachSession(record);
          sessionSummaries = await sessionStore.list();
          events.publish(currentState());
          return json({ accepted: true, sessionId: record.id }, 202);
        }
        if (url.pathname === "/api/session/select") {
          if (activeRun) return json({ error: "Cannot switch sessions while a run is active." }, 409);
          if (typeof body.sessionId !== "string") return json({ error: "sessionId is required." }, 400);
          const record = await sessionStore.load(body.sessionId);
          attachSession(record);
          sessionSummaries = await sessionStore.list();
          events.publish(currentState());
          return json({ accepted: true, sessionId: record.id }, 202);
        }
        if (url.pathname === "/api/session/branch") {
          if (activeRun) return json({ error: "Cannot branch a session while a run is active." }, 409);
          if (typeof body.promptId !== "string") return json({ error: "promptId is required." }, 400);
          branchSessionRecord(activeSessionRecord, body.promptId);
          attachSession(activeSessionRecord);
          await sessionStore.save(activeSessionRecord);
          sessionSummaries = await sessionStore.list();
          events.publish(currentState());
          return json({ accepted: true, sessionId: activeSessionRecord.id }, 202);
        }
        if (url.pathname === "/api/queue/cancel") {
          if (typeof body.queueId !== "string" || !body.queueId) return json({ error: "queueId is required." }, 400);
          if (!cancelQueuedPrompt(body.queueId)) return json({ error: "Queued prompt is no longer pending." }, 409);
          return json({ accepted: true }, 202);
        }
        if (url.pathname === "/api/steer") {
          session.steer(messageFrom(body));
          return json({ accepted: true }, 202);
        }
        if (url.pathname === "/api/abort") {
          session.abort();
          approvals.cancelAll();
          return json({ accepted: true }, 202);
        }
        if (url.pathname === "/api/approval") {
          if (typeof body.requestId !== "string") return json({ error: "requestId is required." }, 400);
          let decision: ApprovalDecision;
          if (body.decision === "approve" || body.decision === "always" || body.decision === "deny") {
            decision = body.decision;
          } else if (typeof body.approved === "boolean") {
            decision = body.approved ? "approve" : "deny";
          } else {
            return json({ error: "decision must be approve, always, or deny." }, 400);
          }
          if (!(await approvals.decide(body.requestId, decision))) return json({ error: "Approval is no longer pending." }, 409);
          return json({ accepted: true }, 202);
        }
        return json({ error: "Not found" }, 404);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    },
  });

  return {
    url: `http://127.0.0.1:${server.port}/`,
    workspace,
    session,
    approvals,
    stop: () => {
      stopped = true;
      queuedPrompts.length = 0;
      session.abort();
      approvals.cancelAll();
      events.close();
      void server.stop(true);
      unsubscribeSession();
      void chromeMcp?.close();
    },
  };
}
