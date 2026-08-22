// PROTOTYPE fixture data. Throwaway.
import type { ApprovalState, QueuedPrompt } from "../../protocol";

export type PRole = "user" | "assistant" | "tool" | "system";

export interface PMessage {
  id: string;
  role: PRole;
  content: string;
  toolName?: string;
  args?: string;
  result?: string;
  status?: "running" | "ok" | "error";
  ts: string;
}

export interface Scenario {
  key: string;
  label: string;
  workspace: string;
  model: string;
  configPath: string;
  running: boolean;
  streamingTail: boolean;
  messages: PMessage[];
  approvals: ApprovalState[];
  queued: QueuedPrompt[];
  error?: string;
  draft?: string;
}

const WORKSPACE = "C:\\SANDBOX\\REPOS\\smith-agent";
const MODEL = "claude-opus-5";
const CONFIG = "smith.config.json";

function approval(id: string, kind: "write" | "shell", toolName: string, args: Record<string, unknown>): ApprovalState {
  return {
    request: { id, kind, toolName, args },
    status: "pending",
    createdAt: Date.now() - 4000,
    updatedAt: Date.now() - 4000,
  };
}

function queued(id: string, message: string): QueuedPrompt {
  return { id, message, createdAt: Date.now() - 1000 };
}

const ASK_ONE: PMessage = {
  id: "u1",
  role: "user",
  content: "Where does the approval flow actually block, and is the queue drained in order?",
  ts: "14:02",
};

const READ_TOOL: PMessage = {
  id: "t1",
  role: "tool",
  content: "",
  toolName: "read_file",
  args: '{ "path": "src/approval.ts" }',
  result: "94 lines read",
  status: "ok",
  ts: "14:02",
};

const GREP_TOOL: PMessage = {
  id: "t2",
  role: "tool",
  content: "",
  toolName: "grep",
  args: '{ "pattern": "queuedPrompts", "path": "src" }',
  result: "src/server.ts:131  const queuedPrompts: QueuedPrompt[] = [];\nsrc/server.ts:156  const next = queuedPrompts.shift();\nsrc/server.ts:171  queuedPrompts.push(prompt);\nsrc/protocol.ts:23  export interface QueuedPrompt {",
  status: "ok",
  ts: "14:03",
};

const RUNNING_TOOL: PMessage = {
  id: "t3",
  role: "tool",
  content: "",
  toolName: "shell",
  args: '{ "command": "bun test tests/server.test.ts" }',
  status: "running",
  ts: "14:03",
};

const ANSWER = `The block happens in \`ApprovalManager.request\`, not in the agent loop.

\`\`\`ts
// src/approval.ts
request = (req: ApprovalRequest, signal?: AbortSignal) =>
  new Promise<boolean>((resolve) => {
    this.pending.set(req.id, resolve);
    this.publish({ type: "approval_request", approval: state });
  });
\`\`\`

The tool call awaits that promise, so the whole run parks until you decide. Nothing
else advances — including the queue.

**Queue ordering.** \`server.ts\` drains strictly FIFO. \`activeRun.finally\` shifts the
head off \`queuedPrompts\` and re-enters \`runPrompt\`, so a message queued third cannot
overtake one queued second.

| Path | Queued? | Order guarantee |
|------|---------|-----------------|
| idle \`/api/prompt\` | no, runs now | n/a |
| busy \`/api/prompt\` | yes | FIFO |
| \`/api/steer\` | no | injected mid-run |
`;

const ANSWER_TAIL = `The block happens in \`ApprovalManager.request\`, not in the agent loop.

\`\`\`ts
// src/approval.ts
request = (req: ApprovalRequest, signal?: AbortSignal) =>
  new Promise<boolean>((resolve) => {
\`\`\`

The tool call awaits that promise, so the whole run parks until you dec`;

const CHART_ANSWER = `Run durations across the last nine prompts, in seconds:

\`\`\`chart
{
  "grid": { "left": 40, "right": 12, "top": 24, "bottom": 28 },
  "xAxis": { "type": "category", "data": ["1","2","3","4","5","6","7","8","9"], "axisLine": { "lineStyle": { "color": "#4a5164" } } },
  "yAxis": { "type": "value", "splitLine": { "lineStyle": { "color": "#252a36" } }, "axisLine": { "lineStyle": { "color": "#4a5164" } } },
  "series": [{ "type": "bar", "data": [4.1, 3.2, 9.8, 5.0, 4.4, 12.1, 3.9, 4.2, 6.7], "itemStyle": { "color": "#9cc8ff" } }]
}
\`\`\`

Two outliers, both shell runs that waited on approval. Excluding those the median is
about \\(4.3\\) seconds.`;

function base(over: Partial<Scenario> & Pick<Scenario, "key" | "label">): Scenario {
  return {
    workspace: WORKSPACE,
    model: MODEL,
    configPath: CONFIG,
    running: false,
    streamingTail: false,
    messages: [],
    approvals: [],
    queued: [],
    ...over,
  };
}

export const scenarios: Scenario[] = [
  base({ key: "empty", label: "Empty, ready" }),
  base({
    key: "streaming",
    label: "Streaming answer",
    running: true,
    streamingTail: true,
    messages: [ASK_ONE, READ_TOOL, { id: "a1", role: "assistant", content: ANSWER_TAIL, ts: "14:03" }],
  }),
  base({
    key: "tools",
    label: "Tool activity",
    running: true,
    messages: [ASK_ONE, READ_TOOL, GREP_TOOL, RUNNING_TOOL],
  }),
  base({
    key: "approval-one",
    label: "One approval",
    running: true,
    messages: [ASK_ONE, READ_TOOL, GREP_TOOL],
    approvals: [approval("ap1", "shell", "shell", { command: "bun test tests/server.test.ts", cwd: WORKSPACE })],
  }),
  base({
    key: "approval-many",
    label: "Two approvals",
    running: true,
    messages: [ASK_ONE, READ_TOOL, GREP_TOOL],
    approvals: [
      approval("ap1", "shell", "shell", { command: "bun test tests/server.test.ts", cwd: WORKSPACE }),
      approval("ap2", "write", "write_file", {
        path: "src/server.ts",
        diff: "@@ -156,7 +156,9 @@\n-      const next = queuedPrompts.shift();\n+      const next = queuedPrompts.shift();\n+      if (next) events.publish(currentState());",
      }),
    ],
  }),
  base({
    key: "queued-one",
    label: "One queued message",
    running: true,
    messages: [ASK_ONE, READ_TOOL, { id: "a1", role: "assistant", content: ANSWER, ts: "14:03" }],
    queued: [queued("q1", "Now check whether abort clears the queue too.")],
  }),
  base({
    key: "queued-many",
    label: "Three queued messages",
    running: true,
    streamingTail: true,
    messages: [ASK_ONE, READ_TOOL, GREP_TOOL, { id: "a1", role: "assistant", content: ANSWER_TAIL, ts: "14:03" }],
    queued: [
      queued("q1", "Now check whether abort clears the queue too."),
      queued("q2", "Then write a test for the FIFO guarantee."),
      queued("q3", "And update README.md with the queue semantics."),
    ],
  }),
  base({
    key: "error",
    label: "Error at composer",
    messages: [ASK_ONE, READ_TOOL, { id: "a1", role: "assistant", content: ANSWER, ts: "14:03" }],
    error: "The message could not be sent. Try again.",
    draft: "Retry the last shell command",
  }),
  base({
    key: "rich",
    label: "Rich response",
    messages: [
      { id: "u2", role: "user", content: "Chart the run durations from the session log.", ts: "14:11" },
      { id: "a2", role: "assistant", content: CHART_ANSWER, ts: "14:11" },
    ],
  }),
  base({
    key: "everything",
    label: "Everything at once",
    running: true,
    streamingTail: true,
    messages: [ASK_ONE, READ_TOOL, GREP_TOOL, RUNNING_TOOL, { id: "a1", role: "assistant", content: ANSWER_TAIL, ts: "14:04" }],
    approvals: [approval("ap1", "shell", "shell", { command: "bun test tests/server.test.ts", cwd: WORKSPACE })],
    queued: [
      queued("q1", "Now check whether abort clears the queue too."),
      queued("q2", "Then write a test for the FIFO guarantee."),
    ],
    error: "Tool run failed: exit code 1",
  }),
];

export function scenarioByKey(key: string): Scenario {
  return scenarios.find((s) => s.key === key) ?? scenarios[0]!;
}
