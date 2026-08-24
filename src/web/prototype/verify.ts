// PROTOTYPE harness. Throwaway.
//
// Serves the REAL src/web/index.html (so the real client.tsx and styles.css render)
// against a scripted /events stream. No agent, no model call, no API key. Used to check
// the promoted layout in every state the handoff brief lists.
import index from "../index.html";
import type { ApprovalState, UiEvent, UiStateEvent } from "../../protocol";

const port = Number(process.env.SMITH_VERIFY_PORT ?? 3212);
const workspace = "C:\\SANDBOX\\REPOS\\smith-agent";
const encoder = new TextEncoder();

const approval = (id: string, kind: "write" | "shell", toolName: string, args: Record<string, unknown>): ApprovalState => ({
  request: { id, kind, toolName, args },
  status: "pending",
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

function state(over: Partial<UiStateEvent> = {}): UiStateEvent {
  return {
    type: "state",
    workspace,
    model: "claude-opus-5",
    configPath: "smith.config.json",
    running: false,
    sessionId: "prototype-session",
    sessions: [{ id: "prototype-session", title: "Context meter smoke test", modelId: "claude-opus-5", createdAt: 1, updatedAt: 1, messageCount: 8 }],
    history: [],
    approvals: [],
    queuedPrompts: [],
    contextUsage: { tokens: 196_500, contextWindow: 262_000, estimated: true },
    ...over,
  };
}

const ANSWER = [
  "The block happens in `ApprovalManager.request`, not in the agent loop.\n\n",
  "```ts\n// src/approval.ts\nrequest = (req: ApprovalRequest) =>\n  new Promise<boolean>((resolve) => {\n    this.pending.set(req.id, resolve);\n  });\n```\n\n",
  "The tool call awaits that promise, so the whole run parks until you decide.\n\n",
  "| Path | Queued? | Order |\n|---|---|---|\n| idle | no | n/a |\n| busy | yes | FIFO |\n\n",
  "Durations, in seconds:\n\n```chart\n{\"xAxis\":{\"type\":\"category\",\"data\":[\"1\",\"2\",\"3\",\"4\",\"5\"]},\"yAxis\":{\"type\":\"value\"},\"series\":[{\"type\":\"bar\",\"data\":[4.1,3.2,9.8,5,4.4],\"itemStyle\":{\"color\":\"#9cc8ff\"}}]}\n```\n\n",
  "Median is $4.3$ seconds.\n",
];

/**
 * Scripted run: prompt -> tools -> approval -> streamed answer -> queue -> error.
 * Ids are unique per connection: the browser reconnects the EventSource and replays
 * this script, and the real server never re-sends agent events with ids already used.
 */
let connection = 0;

function script(): Array<{ after: number; event: UiEvent }> {
  const run = `r${++connection}`;
  const steps: Array<{ after: number; event: UiEvent }> = [];
  let t = 400;
  const push = (event: UiEvent, gap = 500) => {
    steps.push({ after: t, event });
    t += gap;
  };

  push({ type: "prompt_start", promptId: `${run}-p1`, message: "Where does the approval flow block, and is the queue drained in order?" });
  push(state({ running: true }));
  push({ type: "tool_start", toolCallId: `${run}-t1`, toolName: "read_file", args: { path: "src/approval.ts" } });
  push({ type: "tool_end", toolCallId: `${run}-t1`, toolName: "read_file", result: "94 lines read", isError: false });
  push({ type: "tool_start", toolCallId: `${run}-t2`, toolName: "grep", args: { pattern: "queuedPrompts", path: "src" } });
  push({
    type: "tool_end",
    toolCallId: `${run}-t2`,
    toolName: "grep",
    result: "src/server.ts:131  const queuedPrompts: QueuedPrompt[] = [];\nsrc/server.ts:156  const next = queuedPrompts.shift();",
    isError: false,
  });
  push({ type: "tool_start", toolCallId: `${run}-t3`, toolName: "shell", args: { command: "bun test tests/server.test.ts" } }, 1600);

  const ask = approval(`${run}-ap1`, "shell", "shell", { command: "bun test tests/server.test.ts", cwd: workspace });
  push({ type: "approval_request", approval: ask }, 900);
  push(state({ running: true, approvals: [ask], queuedPrompts: [{ id: `${run}-q1`, message: "Now check whether abort clears the queue too.", createdAt: Date.now() }] }), 2600);

  push({ type: "approval_update", approval: { ...ask, status: "approved" } }, 400);
  push(
    state({
      running: true,
      queuedPrompts: [
        { id: `${run}-q1`, message: "Now check whether abort clears the queue too.", createdAt: Date.now() },
        { id: `${run}-q2`, message: "Then write a test for the FIFO guarantee.", createdAt: Date.now() },
      ],
    }),
    400,
  );
  push({ type: "tool_end", toolCallId: `${run}-t3`, toolName: "shell", result: "18 pass, 0 fail", isError: false }, 500);

  for (const delta of ANSWER) push({ type: "text_delta", delta }, 700);

  push({ type: "error", message: "Tool run failed: exit code 1" }, 600);
  push(state({ running: false, queuedPrompts: [] }));
  return steps;
}

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  development: true,
  idleTimeout: 255,
  routes: { "/": index },
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/events") {
      const timers: ReturnType<typeof setTimeout>[] = [];
      let open = true;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: UiEvent) => {
            if (!open) return;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
            } catch {
              open = false;
            }
          };
          send(state());
          for (const step of script()) timers.push(setTimeout(() => send(step.event), step.after));
        },
        cancel() {
          open = false;
          timers.forEach(clearTimeout);
        },
      });
      return new Response(stream, {
        headers: { "Cache-Control": "no-cache", "Content-Type": "text/event-stream; charset=utf-8" },
      });
    }
    if (request.method === "POST") return new Response(JSON.stringify({ accepted: true }), { status: 202, headers: { "Content-Type": "application/json" } });
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Promoted layout, scripted run: http://127.0.0.1:${server.port}/`);
