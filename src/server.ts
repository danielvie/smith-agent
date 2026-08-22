import { randomUUID } from "node:crypto";
import index from "./web/index.html";
import { ApprovalManager } from "./approval";
import { SmithAgentSession } from "./agent";
import { connectChromeDevToolsMcp } from "./mcp";
import { DEFAULT_CONFIG_PATH, loadSmithConfig } from "./config";
import type { ApprovalState, McpServerState, QueuedPrompt, UiEvent, UiStateEvent } from "./protocol";
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
  port?: number;
  chromeDevtools?: boolean;
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

function stateEvent(workspace: Workspace, model: string, configPath: string, running: boolean, approvals: ApprovalState[], queuedPrompts: QueuedPrompt[], mcpServers: McpServerState[]): UiStateEvent {
  return {
    type: "state",
    workspace: workspace.root,
    model,
    configPath,
    running,
    approvals,
    queuedPrompts: queuedPrompts.map((prompt) => ({ ...prompt })),
    mcpServers: mcpServers.map((server) => ({ ...server })),
  };
}

function envFlag(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
}

export async function startUiServer(options: UiServerOptions = {}): Promise<UiServerHandle> {
  const workspace = await openWorkspace(options.workspacePath ?? process.cwd());
  const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
  const config = await loadSmithConfig(workspace, configPath);
  const modelId = process.env.SMITH_MODEL?.trim() || config.model;
  const approvals = new ApprovalManager();
  const enableChromeDevtools = options.chromeDevtools ?? config.chromeDevtools ?? envFlag("SMITH_CHROME_DEVTOOLS") ?? false;
  const chromeMcp = enableChromeDevtools ? await connectChromeDevToolsMcp({ workspaceRoot: workspace.root }) : undefined;
  let session: SmithAgentSession;
  try {
    session = SmithAgentSession.create({
      workspace,
      modelId,
      approve: approvals.request,
      extraTools: chromeMcp?.tools,
      protectedToolKinds: chromeMcp?.protectedToolKinds,
    });
  } catch (error) {
    await chromeMcp?.close();
    throw error;
  }
  let running = false;
  let activeRun: Promise<void> | undefined;
  let stopped = false;
  const queuedPrompts: QueuedPrompt[] = [];
  const mcpServers: McpServerState[] = chromeMcp ? [{ name: "chrome-devtools", toolCount: chromeMcp.tools.length }] : [];

  const currentState = () => stateEvent(workspace, session.modelId, configPath, running, approvals.list(), queuedPrompts, mcpServers);
  const events = new SseHub(currentState);
  session.subscribe((event) => events.publish(event));
  approvals.subscribe((event) => events.publish(event));

  const runPrompt = (prompt: QueuedPrompt): void => {
    running = true;
    events.publish({ type: "prompt_start", promptId: prompt.id, message: prompt.message });
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

      if (request.method !== "POST") return json({ error: "Not found" }, 404);

      try {
        const body = await requestBody(request);
        if (url.pathname === "/api/prompt") {
          return json(submitPrompt(messageFrom(body)), 202);
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
          if (typeof body.requestId !== "string" || typeof body.approved !== "boolean") {
            return json({ error: "requestId and approved are required." }, 400);
          }
          if (!approvals.decide(body.requestId, body.approved)) return json({ error: "Approval is no longer pending." }, 409);
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
      void chromeMcp?.close();
    },
  };
}
