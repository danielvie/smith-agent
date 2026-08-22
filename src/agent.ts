import { Agent, type AgentEvent, type AgentTool, type AgentToolResult } from "@earendil-works/pi-agent-core";
import { createModels, Type, type Static } from "@earendil-works/pi-ai";
import { fireworksProvider } from "@earendil-works/pi-ai/providers/fireworks";
import type { BeforeToolCallContext } from "@earendil-works/pi-agent-core";
import { MAX_COMMAND_TIMEOUT_MS, type Workspace, type WorkspaceEntry } from "./workspace";

const DEFAULT_MODEL_ID = "accounts/fireworks/models/kimi-k2p6";
const PROTECTED_TOOLS = new Map<string, ApprovalKind>([
  ["write_file", "write"],
  ["edit_file", "write"],
  ["run_command", "shell"],
]);

type ApprovalKind = "write" | "shell";

export interface ApprovalRequest {
  kind: ApprovalKind;
  toolName: string;
  args: Record<string, unknown>;
}

export type ApprovalHandler = (request: ApprovalRequest, signal?: AbortSignal) => Promise<boolean>;

export type SmithEvent =
  | { type: "status"; status: "started" | "turn_started" | "completed" }
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_update"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "tool_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "error"; message: string };

export type SmithEventListener = (event: SmithEvent) => void;

export class AgentConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentConfigurationError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toolResult<T extends object>(details: T): AgentToolResult<T> {
  return {
    content: [{ type: "text", text: JSON.stringify(details, null, 2) }],
    details,
  };
}

function normalizeEntries(entries: WorkspaceEntry[]): WorkspaceEntry[] {
  return entries.map((entry) => ({ name: entry.name, type: entry.type }));
}

const listFilesParameters = Type.Object({
  path: Type.Optional(Type.String({ description: "Directory relative to the workspace root. Defaults to ." })),
});
type ListFilesParameters = Static<typeof listFilesParameters>;

const readFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
});
type ReadFileParameters = Static<typeof readFileParameters>;

const writeFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
  content: Type.String({ description: "Complete UTF-8 content to write." }),
});
type WriteFileParameters = Static<typeof writeFileParameters>;

const editFileParameters = Type.Object({
  path: Type.String({ description: "File path relative to the workspace root." }),
  old_text: Type.String({ description: "Exact text to replace." }),
  new_text: Type.String({ description: "Replacement text." }),
  replace_all: Type.Optional(Type.Boolean({ description: "Replace every match instead of requiring one match." })),
});
type EditFileParameters = Static<typeof editFileParameters>;

const runCommandParameters = Type.Object({
  command: Type.String({ description: "Shell command to run from the workspace root." }),
  cwd: Type.Optional(Type.String({ description: "Directory relative to the workspace root. Defaults to ." })),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_COMMAND_TIMEOUT_MS, description: "Timeout in milliseconds." })),
});
type RunCommandParameters = Static<typeof runCommandParameters>;

export function createWorkspaceTools(workspace: Workspace): AgentTool[] {
  const listFilesTool: AgentTool<typeof listFilesParameters, { entries: WorkspaceEntry[] }> = {
    name: "list_files",
    label: "List files",
    description: "List files and directories under the workspace. Symlinks are reported but not followed by file operations.",
    parameters: listFilesParameters,
    async execute(_toolCallId, params: ListFilesParameters) {
      return toolResult({ entries: normalizeEntries(await workspace.listDirectory(params.path ?? ".")) });
    },
  };

  const readFileTool: AgentTool<typeof readFileParameters, { path: string; bytes: number; content: string }> = {
    name: "read_file",
    label: "Read file",
    description: "Read a bounded UTF-8 text file inside the workspace.",
    parameters: readFileParameters,
    async execute(_toolCallId, params: ReadFileParameters) {
      return toolResult(await workspace.readFile(params.path));
    },
  };

  const writeFileTool: AgentTool<typeof writeFileParameters, { path: string; bytes: number; content: string }> = {
    name: "write_file",
    label: "Write file",
    description: "Write complete UTF-8 content to a file inside the workspace. Requires approval.",
    parameters: writeFileParameters,
    async execute(_toolCallId, params: WriteFileParameters) {
      return toolResult(await workspace.writeFile(params.path, params.content));
    },
  };

  const editFileTool: AgentTool<typeof editFileParameters, { path: string; bytes: number; content: string }> = {
    name: "edit_file",
    label: "Edit file",
    description: "Replace exact text in a UTF-8 file inside the workspace. Requires approval.",
    parameters: editFileParameters,
    async execute(_toolCallId, params: EditFileParameters) {
      return toolResult(await workspace.editFile(params.path, params.old_text, params.new_text, params.replace_all ?? false));
    },
  };

  const runCommandTool: AgentTool<typeof runCommandParameters, { command: string; cwd: string; exitCode: number; stdout: string; stderr: string; stdoutTruncated: boolean; stderrTruncated: boolean }> = {
    name: "run_command",
    label: "Run command",
    description: "Run a shell command in a workspace directory and return bounded stdout and stderr. Requires approval.",
    parameters: runCommandParameters,
    async execute(_toolCallId, params: RunCommandParameters, signal) {
      return toolResult(await workspace.runCommand(params.command, params.cwd ?? ".", signal, params.timeout_ms));
    },
  };

  return [listFilesTool, readFileTool, writeFileTool, editFileTool, runCommandTool];
}

export function mapPiEvent(event: AgentEvent): SmithEvent[] {
  switch (event.type) {
    case "agent_start":
      return [{ type: "status", status: "started" }];
    case "agent_end":
      return [{ type: "status", status: "completed" }];
    case "turn_start":
      return [{ type: "status", status: "turn_started" }];
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        return [{ type: "text_delta", delta: event.assistantMessageEvent.delta }];
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        return [{ type: "thinking_delta", delta: event.assistantMessageEvent.delta }];
      }
      return [];
    case "tool_execution_start":
      return [{ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args }];
    case "tool_execution_update":
      return [{ type: "tool_update", toolCallId: event.toolCallId, toolName: event.toolName, partialResult: event.partialResult }];
    case "tool_execution_end":
      return [{ type: "tool_end", toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError }];
    default:
      return [];
  }
}

export interface SmithAgentOptions {
  workspace: Workspace;
  modelId?: string;
  apiKey?: string;
  approve?: ApprovalHandler;
}

export class SmithAgentSession {
  readonly workspace: Workspace;
  readonly modelId: string;
  private readonly agent: Agent;
  private readonly listeners = new Set<SmithEventListener>();

  private constructor(options: SmithAgentOptions, agent: Agent) {
    this.workspace = options.workspace;
    this.modelId = options.modelId ?? DEFAULT_MODEL_ID;
    this.agent = agent;
    this.agent.subscribe((event) => {
      for (const appEvent of mapPiEvent(event)) {
        for (const listener of this.listeners) listener(appEvent);
      }
    });
  }

  static create(options: SmithAgentOptions): SmithAgentSession {
    const apiKey = options.apiKey?.trim() || process.env.API_KEY_FIREWORKS?.trim() || process.env.FIREWORKS_API_KEY?.trim();
    if (!apiKey) {
      throw new AgentConfigurationError("API_KEY_FIREWORKS is required. Set it in the environment or pass apiKey.");
    }

    const modelId = options.modelId ?? process.env.SMITH_MODEL ?? DEFAULT_MODEL_ID;
    const models = createModels();
    models.setProvider(fireworksProvider());
    const model = models.getModel("fireworks", modelId);
    if (!model) throw new AgentConfigurationError(`Fireworks model not found: ${modelId}.`);

    const tools = createWorkspaceTools(options.workspace);
    const approve = options.approve ?? (async () => false);
    const agent = new Agent({
      initialState: {
        systemPrompt: [
          "You are Smith Agent, a local assistant for simple project automation.",
          `The workspace root is ${options.workspace.root}.`,
          "Use the workspace tools instead of inventing file contents or command output.",
          "Paths passed to tools must be relative to the workspace root.",
          "Explain what you changed and report command results accurately.",
        ].join("\n"),
        model,
        tools,
      },
      streamFn: models.streamSimple.bind(models),
      getApiKey: () => apiKey,
      toolExecution: "sequential",
      beforeToolCall: async (context, signal) => checkApproval(context, approve, signal),
    });

    return new SmithAgentSession({ ...options, modelId }, agent);
  }

  subscribe(listener: SmithEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  prompt(input: string): Promise<void> {
    return this.agent.prompt(input);
  }

  steer(input: string): void {
    this.agent.steer({ role: "user", content: input, timestamp: Date.now() });
  }

  followUp(input: string): void {
    this.agent.followUp({ role: "user", content: input, timestamp: Date.now() });
  }

  abort(): void {
    this.agent.abort();
  }
}

async function checkApproval(context: BeforeToolCallContext, approve: ApprovalHandler, signal?: AbortSignal) {
  const kind = PROTECTED_TOOLS.get(context.toolCall.name);
  if (!kind) return undefined;

  const args = context.args && typeof context.args === "object" ? context.args as Record<string, unknown> : {};
  try {
    if (await approve({ kind, toolName: context.toolCall.name, args }, signal)) return undefined;
    return { block: true, terminate: true, reason: "Approval denied by the user." };
  } catch (error) {
    return { block: true, terminate: true, reason: `Approval failed: ${errorMessage(error)}` };
  }
}
