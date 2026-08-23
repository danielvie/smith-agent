export type ApprovalKind = "write" | "shell" | "browser" | "web";
export type ApprovalDecision = "approve" | "always" | "deny";
export type ApprovalStatus = "pending" | "approved" | "denied" | "cancelled";

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ApprovalState {
  request: ApprovalRequest;
  status: ApprovalStatus;
  createdAt: number;
  updatedAt: number;
  reason?: string;
}

export interface QueuedPrompt {
  id: string;
  message: string;
  createdAt: number;
}

export type ApprovalHandler = (request: ApprovalRequest, signal?: AbortSignal) => Promise<ApprovalDecision>;

export type SmithEvent =
  | { type: "status"; status: "started" | "turn_started" | "completed" }
  | { type: "prompt_start"; promptId: string; message: string }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "approval_request"; approval: ApprovalState }
  | { type: "approval_update"; approval: ApprovalState }
  | { type: "error"; message: string };

export interface McpServerState {
  name: string;
  toolCount: number;
}

export interface SessionSummary {
  id: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

export interface UiStateEvent {
  type: "state";
  workspace: string;
  model: string;
  configPath: string;
  running: boolean;
  sessionId: string;
  sessions: SessionSummary[];
  history: SmithEvent[];
  approvals: ApprovalState[];
  queuedPrompts: QueuedPrompt[];
  mcpServers?: McpServerState[];
}

export type UiEvent = SmithEvent | UiStateEvent;
