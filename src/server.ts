import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { ApprovalManager } from "./approval";
import { loadApprovalPolicy } from "./approval-policy";
import { DEFAULT_MODEL_ID, SmithAgentSession } from "./agent";
import { branchSessionRecord, SessionStore, type SessionRecord } from "./session";
import { connectConfiguredChromeDevToolsMcp } from "./mcp";
import { DEFAULT_CONFIG_PATH, loadSmithConfig } from "./config";
import { DEFAULT_MCP_CONFIG_PATH, loadMcpConfig } from "./mcp-config";
import type { ApprovalDecision, ApprovalState, ContextUsage, McpServerState, PromptImage, QueuedPrompt, SessionSummary, SmithEvent, UiEvent, UiStateEvent } from "./protocol";
import { loadUiAsset } from "./ui-assets";
import { openWorkspace, type Workspace } from "./workspace";

export const DEFAULT_UI_PORT = 3210;
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const MAX_SCREENSHOTS = 4;
const SCREENSHOT_MIME_TYPES = new Set<PromptImage["mimeType"]>(["image/png", "image/jpeg", "image/webp"]);

type EventController = ReadableStreamDefaultController<Uint8Array>;
type PendingPrompt = QueuedPrompt & { images: PromptImage[] };

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
  disableAutomaticSkillDetection?: boolean;
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

function webRequest(request: IncomingMessage): Request {
  const host = request.headers.host ?? "127.0.0.1";
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) value.forEach((item) => headers.append(name, item));
    else if (value !== undefined) headers.set(name, value);
  }
  const init: RequestInit & { duplex?: "half" } = { method: request.method, headers };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = Readable.toWeb(request) as ReadableStream<Uint8Array>;
    init.duplex = "half";
  }
  return new Request(`http://${host}${request.url ?? "/"}`, init);
}

async function sendWebResponse(source: Response, target: ServerResponse): Promise<void> {
  target.statusCode = source.status;
  if (source.statusText) target.statusMessage = source.statusText;
  source.headers.forEach((value, name) => target.setHeader(name, value));
  if (!source.body) {
    target.end();
    return;
  }
  await pipeline(Readable.fromWeb(source.body as unknown as NodeReadableStream), target);
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

function base64ByteLength(value: string): number {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(value)) throw new Error("screenshot data must be valid base64.");
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return value.length / 4 * 3 - padding;
}

function promptFrom(body: Record<string, unknown>): { message: string; images: PromptImage[] } {
  if (body.message !== undefined && typeof body.message !== "string") throw new Error("message must be a string.");
  const message = typeof body.message === "string" ? body.message : "";
  if (message.length > 16_000) throw new Error("message exceeds the 16000-character limit.");
  if (body.images !== undefined && !Array.isArray(body.images)) throw new Error("images must be an array.");
  const values = body.images ?? [];
  if (values.length > MAX_SCREENSHOTS) throw new Error(`A prompt can contain at most ${MAX_SCREENSHOTS} screenshots.`);

  let totalBytes = 0;
  const images = values.map((value): PromptImage => {
    if (!isRecord(value) || typeof value.data !== "string" || typeof value.mimeType !== "string" || !SCREENSHOT_MIME_TYPES.has(value.mimeType as PromptImage["mimeType"])) {
      throw new Error("Screenshots must be PNG, JPEG, or WebP images.");
    }
    totalBytes += base64ByteLength(value.data);
    return { type: "image", data: value.data, mimeType: value.mimeType as PromptImage["mimeType"] };
  });
  if (totalBytes > MAX_SCREENSHOT_BYTES) throw new Error("Screenshots exceed the 5 MB combined limit.");
  if (!message.trim() && images.length === 0) throw new Error("message or screenshot is required.");
  return { message: message.trim() ? message : "Please examine the attached screenshot.", images };
}

function stateEvent(workspace: Workspace, model: string, configPath: string, sessionId: string, sessions: SessionSummary[], history: SmithEvent[], running: boolean, approvals: ApprovalState[], queuedPrompts: PendingPrompt[], contextUsage: ContextUsage, mcpServers: McpServerState[]): UiStateEvent {
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
    queuedPrompts: queuedPrompts.map(({ images, ...prompt }) => ({ ...prompt, imageCount: images.length })),
    contextUsage,
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
    ? await sessionStore.createAndOpen(selectedModelId)
    : options.sessionId
      ? await sessionStore.resume(options.sessionId)
      : await sessionStore.openLatestOrCreate(selectedModelId);
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
  const queuedPrompts: PendingPrompt[] = [];
  const mcpServers: McpServerState[] = chromeMcp ? [{ name: "chrome-devtools", toolCount: chromeMcp.tools.length }] : [];
  let events: SseHub;

  const currentState = () => stateEvent(workspace, session.modelId, configPath, activeSessionRecord.id, sessionSummaries, activeSessionRecord.history, running, approvals.list(), queuedPrompts, session.contextUsage, mcpServers);
  events = new SseHub(currentState);

  const createSession = (record: SessionRecord): SmithAgentSession => SmithAgentSession.create({
    workspace,
    modelId: record.modelId,
    sessionId: record.id,
    messages: record.messages,
    approve: approvals.request,
    extraTools: chromeMcp?.tools,
    protectedToolKinds: chromeMcp?.protectedToolKinds,
    disableAutomaticSkillDetection: options.disableAutomaticSkillDetection,
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

  const runPrompt = (prompt: PendingPrompt): void => {
    running = true;
    if (activeSessionRecord.title === "New session") void sessionStore.setTitle(activeSessionRecord, prompt.message);
    const promptStart: SmithEvent = { type: "prompt_start", promptId: prompt.id, message: prompt.message, imageCount: prompt.images.length };
    activeSessionRecord.promptMessageStarts[prompt.id] = session.messageCount;
    activeSessionRecord.history.push(promptStart);
    events.publish(promptStart);
    events.publish(currentState());
    const run = Promise.resolve().then(() => session.prompt(prompt.message, prompt.images)).catch((error: unknown) => {
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

  const submitPrompt = (message: string, images: PromptImage[]): { accepted: true; queued: boolean; id: string } => {
    const prompt: PendingPrompt = { id: randomUUID(), message, images, createdAt: Date.now() };
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

  const [index, client, styles] = await Promise.all([
    loadUiAsset("index.html"),
    loadUiAsset("client.js"),
    loadUiAsset("client.css"),
  ]);

  const handleRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") return new Response(index, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    if (request.method === "GET" && url.pathname === "/client.js") return new Response(client, { headers: { "Content-Type": "text/javascript; charset=utf-8" } });
    if (request.method === "GET" && url.pathname === "/client.css") return new Response(styles, { headers: { "Content-Type": "text/css; charset=utf-8" } });
    if (request.method === "GET" && url.pathname === "/events") return events.response();
    if (request.method === "GET" && url.pathname === "/api/state") return json(currentState());
    if (request.method === "GET" && url.pathname === "/api/sessions") return json({ sessions: sessionSummaries, activeSessionId: activeSessionRecord.id });

    if (request.method !== "POST") return json({ error: "Not found" }, 404);

    try {
      const body = await requestBody(request);
      if (url.pathname === "/api/prompt") {
        const prompt = promptFrom(body);
        return json(submitPrompt(prompt.message, prompt.images), 202);
      }

      if (url.pathname === "/api/session/new") {
        if (activeRun) return json({ error: "Cannot switch sessions while a run is active." }, 409);
        const previousId = activeSessionRecord.id;
        const record = await sessionStore.createAndOpen(selectedModelId);
        attachSession(record);
        await sessionStore.release(previousId);
        sessionSummaries = await sessionStore.list();
        events.publish(currentState());
        return json({ accepted: true, sessionId: record.id }, 202);
      }
      if (url.pathname === "/api/session/select") {
        if (activeRun) return json({ error: "Cannot switch sessions while a run is active." }, 409);
        if (typeof body.sessionId !== "string") return json({ error: "sessionId is required." }, 400);
        const previousId = activeSessionRecord.id;
        const record = await sessionStore.resume(body.sessionId);
        attachSession(record);
        if (record.id !== previousId) await sessionStore.release(previousId);
        sessionSummaries = await sessionStore.list();
        events.publish(currentState());
        return json({ accepted: true, sessionId: record.id }, 202);
      }
      if (url.pathname === "/api/session/delete") {
        if (activeRun) return json({ error: "Cannot delete a session while a run is active." }, 409);
        if (typeof body.sessionId !== "string") return json({ error: "sessionId is required." }, 400);
        if (body.sessionId !== activeSessionRecord.id) return json({ error: "Only the active session can be deleted." }, 409);
        await sessionStore.delete(body.sessionId);
        const record = await sessionStore.openLatestOrCreate(selectedModelId);
        attachSession(record);
        sessionSummaries = await sessionStore.list();
        events.publish(currentState());
        return json({ accepted: true, deletedSessionId: body.sessionId, sessionId: record.id }, 202);
      }
      if (url.pathname === "/api/session/rename") {
        if (typeof body.title !== "string") return json({ error: "title is required." }, 400);
        await sessionStore.setTitle(activeSessionRecord, body.title);
        sessionSummaries = await sessionStore.list();
        events.publish(currentState());
        return json({ accepted: true }, 202);
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
  };

  const server = createServer((incoming, outgoing) => {
    void handleRequest(webRequest(incoming))
      .then((response) => sendWebResponse(response, outgoing))
      .catch((error: unknown) => {
        if (outgoing.headersSent) {
          outgoing.destroy(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        outgoing.statusCode = 500;
        outgoing.setHeader("Content-Type", "application/json; charset=utf-8");
        outgoing.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
      });
  });
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once("error", onError);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", onError);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not determine the UI server port.");

  return {
    url: `http://127.0.0.1:${address.port}/`,
    workspace,
    session,
    approvals,
    stop: () => {
      stopped = true;
      queuedPrompts.length = 0;
      session.abort();
      approvals.cancelAll();
      events.close();
      server.close();
      server.closeAllConnections();
      unsubscribeSession();
      void sessionStore.close();
      void chromeMcp?.close();
    },
  };
}
