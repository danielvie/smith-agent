import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import { DEFAULT_MODEL_ID, SmithAgentSession, type ApprovalRequest, type SmithEvent } from "./agent";
import { DEFAULT_APPROVALS_PATH, loadApprovalPolicy, type ApprovalPolicyStore } from "./approval-policy";
import type { ApprovalDecision } from "./protocol";
import { DEFAULT_CONFIG_PATH, loadSmithConfig } from "./config";
import { DEFAULT_MCP_CONFIG_PATH, loadMcpConfig } from "./mcp-config";
import { connectConfiguredChromeDevToolsMcp } from "./mcp";
import { SessionStore, type SessionRecord } from "./session";
import { openWorkspace } from "./workspace";

interface CliOptions {
  workspacePath: string;
  configPath: string;
  mcpConfigPath: string;
  sessionId: string | undefined;
  newSession: boolean;
  port: number | undefined;
  ui: boolean;
  openBrowser: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let workspacePath = process.cwd();
  let configPath = DEFAULT_CONFIG_PATH;
  let mcpConfigPath = DEFAULT_MCP_CONFIG_PATH;
  let sessionId: string | undefined;
  let newSession = false;
  let port: number | undefined;
  let ui = false;
  let openBrowser = true;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--ui") {
      ui = true;
      continue;
    }
    if (argument === "--no-open") {
      openBrowser = false;
      continue;
    }

    if (argument === "--workspace") {
      const next = argv[index + 1];
      if (!next) throw new Error("--workspace requires a path.");
      workspacePath = next;
      index += 1;
      continue;
    }
    if (argument === "--config") {
      const next = argv[index + 1];
      if (!next) throw new Error("--config requires a relative path.");
      configPath = next;
      index += 1;
      continue;
    }
    if (argument === "--mcp-config") {
      const next = argv[index + 1];
      if (!next) throw new Error("--mcp-config requires a relative path.");
      mcpConfigPath = next;
      index += 1;
      continue;
    }
    if (argument === "--session") {
      const next = argv[index + 1];
      if (!next) throw new Error("--session requires an id.");
      sessionId = next;
      index += 1;
      continue;
    }
    if (argument === "--new-session") {
      newSession = true;
      continue;
    }
    if (argument === "--port") {
      const next = argv[index + 1];
      const parsed = next === undefined ? Number.NaN : Number(next);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535) throw new Error("--port must be an integer between 0 and 65535.");
      port = parsed;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (sessionId && newSession) throw new Error("--session and --new-session cannot be used together.");
  return { workspacePath, configPath, mcpConfigPath, sessionId, newSession, port, ui, openBrowser, help };
}

function printHelp(): void {
  output.write(`Smith Agent\n\nUsage:\n  smith [--workspace <path>] [--config <relative-path>] [--mcp-config <relative-path>] [--session <id>] [--new-session]\n  smith --ui [--workspace <path>] [--config <relative-path>] [--mcp-config <relative-path>] [--session <id>] [--new-session] [--port <number>]\n\nOptions:\n  --ui                  Start the browser UI\n  --no-open             Do not open the browser automatically\n  --port                UI port, default 3210 (use 0 for an ephemeral port)\n  --config              Smith config path, default smith.config.json\n  --mcp-config          MCP config path, default mcp.json\n  --session             Resume a session by id\n  --new-session         Start a new session instead of resuming the latest\n\nCommands:\n  /help                 Show this help\n  /sessions             List saved sessions\n  /resume <id>          Resume a saved session\n  /new                  Start a new session\n  /steer <message>      Queue guidance for the active run\n  /abort                Stop the active run\n  /exit                 Quit\n\nThe current directory is the workspace unless --workspace is supplied.\nConfig defaults to smith.config.json and mcp.json in that workspace.\n\nEnvironment:\n  UDAL_PAT              BCAI UDAL token\n  API_KEY_FIREWORKS     Fireworks API key\n  FIREWORKS_API_KEY     Fireworks API key fallback\n  SMITH_MODEL           Override the configured model\n`);
}

function approvalSummary(request: ApprovalRequest): string {
  if (request.kind === "browser") return `browser action '${request.toolName}'`;
  if (request.kind === "web") return `web request '${request.toolName}'`;
  if (request.toolName === "run_command") {
    const command = String(request.args.command ?? "").replace(/\s+/gu, " ").trim();
    return `command '${command.slice(0, 160)}${command.length > 160 ? "..." : ""}'`;
  }
  return `file '${String(request.args.path ?? "")}'`;
}

async function askForApproval(request: ApprovalRequest, rl: ReturnType<typeof createInterface>, policy: ApprovalPolicyStore): Promise<ApprovalDecision> {
  if (policy.isAlwaysApproved(request.toolName)) return "approve";
  const answer = await rl.question(`\nApprove ${request.kind} operation ${approvalSummary(request)}? [y]es / [a]lways / [N]o `);
  if (/^(?:a|always)$/iu.test(answer.trim())) {
    await policy.alwaysApprove(request.toolName);
    return "always";
  }
  return /^y(?:es)?$/iu.test(answer.trim()) ? "approve" : "deny";
}

function openBrowser(url: string): void {
  const command = process.platform === "win32"
    ? ["cmd.exe", "/d", "/c", "start", "", url]
    : process.platform === "darwin"
      ? ["open", url]
      : ["xdg-open", url];
  void Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
}

async function runUi(options: CliOptions): Promise<void> {
  const { startUiServer } = await import("./server");
  const handle = await startUiServer({ workspacePath: options.workspacePath, configPath: options.configPath, mcpConfigPath: options.mcpConfigPath, sessionId: options.sessionId, newSession: options.newSession, port: options.port });
  output.write(`Smith UI: ${handle.url}\n`);
  output.write(`Smith workspace: ${handle.workspace.root}\n`);
  output.write(`Smith model: ${handle.session.modelId}\n`);
  if (options.openBrowser) openBrowser(handle.url);

  await new Promise<void>((resolve) => {
    const stop = () => {
      handle.stop();
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}


function printEvent(event: SmithEvent): void {
  switch (event.type) {
    case "text_delta":
      output.write(event.delta);
      break;
    case "thinking_delta":
      break;
    case "tool_start":
      output.write(`\n[tool ${event.toolName}] ${JSON.stringify(event.args)}\n`);
      break;
    case "tool_update":
      break;
    case "tool_end":
      output.write(`[tool ${event.toolName} ${event.isError ? "failed" : "done"}]\n`);
      break;
    case "error":
      output.write(`\n[agent error] ${event.message}\n`);
      break;
    case "status":
      break;
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }
  if (options.ui) {
    await runUi(options);
    return;
  }

  const workspace = await openWorkspace(options.workspacePath);
  const config = await loadSmithConfig(workspace, options.configPath);
  const approvalPolicy = await loadApprovalPolicy(workspace);
  const mcpConfig = await loadMcpConfig(workspace, options.mcpConfigPath);
  const modelId = process.env.SMITH_MODEL?.trim() || config.model;
  const chromeServer = mcpConfig.mcpServers?.["chrome-devtools"];
  const chromeMcp = chromeServer && chromeServer.enabled !== false
    ? await connectConfiguredChromeDevToolsMcp(chromeServer, workspace.root)
    : undefined;
  const sessionStore = new SessionStore(workspace);
  const selectedModelId = modelId ?? DEFAULT_MODEL_ID;
  const initialRecord = options.newSession
    ? await sessionStore.create(selectedModelId)
    : options.sessionId
      ? await sessionStore.load(options.sessionId)
      : await sessionStore.latest() ?? await sessionStore.create(selectedModelId);
  let activeRecord: SessionRecord = initialRecord;
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY) });
  let session!: SmithAgentSession;
  let unsubscribe: () => void = () => {};

  const activate = (record: SessionRecord): void => {
    unsubscribe();
    activeRecord = record;
    session = SmithAgentSession.create({
      workspace,
      modelId: record.modelId,
      sessionId: record.id,
      messages: record.messages,
      approve: (request) => askForApproval(request, rl, approvalPolicy),
      extraTools: chromeMcp?.tools,
      protectedToolKinds: chromeMcp?.protectedToolKinds,
      onMessagesChange: async (messages) => {
        record.messages = messages;
        await sessionStore.save(record);
      },
    });
    unsubscribe = session.subscribe((event) => {
      record.history.push(event);
      printEvent(event);
    });
  };

  try {
    activate(initialRecord);
    output.write(`Smith workspace: ${workspace.root}\n`);
    output.write(`Smith model: ${session.modelId}\n`);
    output.write(`Smith config: ${options.configPath}\n`);
    output.write(`Smith MCP config: ${options.mcpConfigPath}\n`);
    output.write(`Smith approvals: ${DEFAULT_APPROVALS_PATH}\n`);
    output.write(`Smith session: ${activeRecord.id}\n`);
    output.write("Type a request, /help, /sessions, /new, or /exit.\n");

    while (true) {
      let line: string;
      try {
        line = await rl.question("smith> ");
      } catch {
        break;
      }
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === "/exit" || trimmed === "/quit") break;
      if (trimmed === "/help") {
        printHelp();
        continue;
      }
      if (trimmed === "/sessions") {
        for (const item of await sessionStore.list()) {
          output.write(`${item.id === activeRecord.id ? "*" : " "} ${item.id} ${item.title} (${item.messageCount} messages)\n`);
        }
        continue;
      }
      if (trimmed === "/new") {
        activate(await sessionStore.create(selectedModelId));
        output.write(`Switched to session ${activeRecord.id}.\n`);
        continue;
      }
      if (trimmed.startsWith("/resume ")) {
        const requestedId = trimmed.slice("/resume ".length).trim();
        if (!requestedId) {
          output.write("Usage: /resume <session-id>\n");
          continue;
        }
        activate(await sessionStore.load(requestedId));
        output.write(`Resumed session ${activeRecord.id}.\n`);
        continue;
      }
      if (trimmed === "/abort") {
        session.abort();
        output.write("Active run aborted.\n");
        continue;
      }
      if (trimmed.startsWith("/steer ")) {
        session.steer(trimmed.slice("/steer ".length));
        output.write("Steering message queued.\n");
        continue;
      }

      try {
        if (activeRecord.title === "New session") await sessionStore.setTitle(activeRecord, line);
        const promptId = randomUUID();
        activeRecord.promptMessageStarts[promptId] = session.messageCount;
        activeRecord.history.push({ type: "prompt_start", promptId, message: line });
        await session.prompt(line);
        output.write("\n");
      } catch (error) {
        output.write(`\n[agent error] ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  } finally {
    unsubscribe();
    rl.close();
    await chromeMcp?.close();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    output.write(`smith: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
