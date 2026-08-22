import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { SmithAgentSession, type ApprovalRequest, type SmithEvent } from "./agent";
import { DEFAULT_CONFIG_PATH, loadSmithConfig } from "./config";
import { connectChromeDevToolsMcp } from "./mcp";
import { openWorkspace } from "./workspace";

interface CliOptions {
  workspacePath: string;
  configPath: string;
  port: number | undefined;
  ui: boolean;
  openBrowser: boolean;
  chromeDevtools: boolean | undefined;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let workspacePath = process.cwd();
  let configPath = DEFAULT_CONFIG_PATH;
  let port: number | undefined;
  let ui = false;
  let openBrowser = true;
  let chromeDevtools: boolean | undefined;
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
    if (argument === "--chrome-devtools") {
      chromeDevtools = true;
      continue;
    }
    if (argument === "--no-chrome-devtools") {
      chromeDevtools = false;
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

  return { workspacePath, configPath, port, ui, openBrowser, chromeDevtools, help };
}

function printHelp(): void {
  output.write(`Smith Agent\n\nUsage:\n  smith [--workspace <path>] [--config <relative-path>] [--chrome-devtools]\n  smith --ui [--workspace <path>] [--config <relative-path>] [--port <number>] [--chrome-devtools]\n\nOptions:\n  --ui                  Start the browser UI\n  --no-open             Do not open the browser automatically\n  --port                UI port, default 3210 (use 0 for an ephemeral port)\n  --chrome-devtools     Connect to Chrome DevTools MCP over stdio\n  --no-chrome-devtools  Disable Chrome DevTools MCP\n\nCommands:\n  /help                 Show this help\n  /steer <message>      Queue guidance for the active run\n  /abort                Stop the active run\n  /exit                 Quit\n\nThe current directory is the workspace unless --workspace is supplied.\nConfig defaults to smith.config.json in that workspace.\n`);
}

function approvalSummary(request: ApprovalRequest): string {
  if (request.kind === "browser") return `browser action '${request.toolName}'`;
  if (request.toolName === "run_command") {
    const command = String(request.args.command ?? "").replace(/\s+/gu, " ").trim();
    return `command '${command.slice(0, 160)}${command.length > 160 ? "..." : ""}'`;
  }
  return `file '${String(request.args.path ?? "")}'`;
}

async function askForApproval(request: ApprovalRequest, rl: ReturnType<typeof createInterface>): Promise<boolean> {
  const answer = await rl.question(`\nApprove ${request.kind} operation ${approvalSummary(request)}? [y/N] `);
  return /^y(?:es)?$/iu.test(answer.trim());
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
  const handle = await startUiServer({ workspacePath: options.workspacePath, configPath: options.configPath, port: options.port, chromeDevtools: options.chromeDevtools });
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

function envFlag(name: string): boolean | undefined {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return undefined;
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
  const modelId = process.env.SMITH_MODEL?.trim() || config.model;
  const enableChromeDevtools = options.chromeDevtools ?? config.chromeDevtools ?? envFlag("SMITH_CHROME_DEVTOOLS") ?? false;
  const chromeMcp = enableChromeDevtools ? await connectChromeDevToolsMcp({ workspaceRoot: workspace.root }) : undefined;
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const session = SmithAgentSession.create({
      workspace,
      modelId,
      approve: (request) => askForApproval(request, rl),
      extraTools: chromeMcp?.tools,
      protectedToolKinds: chromeMcp?.protectedToolKinds,
    });
    session.subscribe(printEvent);

    output.write(`Smith workspace: ${workspace.root}\n`);
    output.write(`Smith model: ${session.modelId}\n`);
    output.write(`Smith config: ${options.configPath}\n`);
    output.write("Type a request, /help, or /exit.\n");

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
        await session.prompt(line);
        output.write("\n");
      } catch (error) {
        output.write(`\n[agent error] ${error instanceof Error ? error.message : String(error)}\n`);
      }
    }
  } finally {
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
