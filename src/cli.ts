import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { SmithAgentSession, type ApprovalRequest, type SmithEvent } from "./agent";
import { DEFAULT_CONFIG_PATH, loadSmithConfig } from "./config";
import { openWorkspace } from "./workspace";

interface CliOptions {
  workspacePath: string;
  configPath: string;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  let workspacePath = process.cwd();
  let configPath = DEFAULT_CONFIG_PATH;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
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
    throw new Error(`Unknown argument: ${argument}`);
  }

  return { workspacePath, configPath, help };
}

function printHelp(): void {
  output.write(`Smith Agent\n\nUsage:\n  smith [--workspace <path>] [--config <relative-path>]\n\nCommands:\n  /help                 Show this help\n  /steer <message>      Queue guidance for the active run\n  /follow-up <message>  Queue a follow-up message\n  /abort                Stop the active run\n  /exit                 Quit\n\nThe current directory is the workspace unless --workspace is supplied.\nConfig defaults to smith.config.json in that workspace.\n`);
}

function approvalSummary(request: ApprovalRequest): string {
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

  const workspace = await openWorkspace(options.workspacePath);
  const config = await loadSmithConfig(workspace, options.configPath);
  const modelId = process.env.SMITH_MODEL?.trim() || config.model;
  const rl = createInterface({ input, output, terminal: Boolean(input.isTTY) });
  try {
    const session = SmithAgentSession.create({
      workspace,
      modelId,
      approve: (request) => askForApproval(request, rl),
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
      if (trimmed.startsWith("/follow-up ")) {
        session.followUp(trimmed.slice("/follow-up ".length));
        output.write("Follow-up message queued.\n");
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
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    output.write(`smith: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
