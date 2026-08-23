import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";
import { Type, type ImageContent, type TextContent } from "@earendil-works/pi-ai";
import type { ApprovalKind } from "./protocol";
import type { McpServerConfig } from "./mcp-config";

export const DEFAULT_CHROME_DEVTOOLS_BROWSER_URL = "http://127.0.0.1:9222";
const CHROME_DEVTOOLS_PACKAGE = "chrome-devtools-mcp@latest";

export type McpClient = Pick<Client, "listTools" | "callTool" | "close">;
type McpToolDefinition = Awaited<ReturnType<Client["listTools"]>>["tools"][number];

export interface McpToolBundle {
  tools: AgentTool[];
  protectedToolKinds: ReadonlyMap<string, ApprovalKind>;
}

export interface ChromeDevToolsMcpConnection extends McpToolBundle {
  close(): Promise<void>;
}

export interface ChromeDevToolsMcpOptions {
  workspaceRoot?: string;
  command?: string;
  args?: string[];
  browserUrl?: string;
  env?: Record<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeToolName(name: string, usedNames: Set<string>, prefix: string): string {
  const base = `${prefix}_${name.replace(/[^a-zA-Z0-9_]/gu, "_") || "tool"}`;
  let candidate = base;
  let suffix = 2;
  while (usedNames.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function textFromBlock(block: unknown): string {
  if (isRecord(block) && block.type === "text" && typeof block.text === "string") return block.text;
  try {
    return JSON.stringify(block);
  } catch {
    return String(block);
  }
}

function toAgentContent(blocks: unknown[]): Array<TextContent | ImageContent> {
  const content: Array<TextContent | ImageContent> = [];
  for (const block of blocks) {
    if (!isRecord(block)) {
      content.push({ type: "text", text: textFromBlock(block) });
      continue;
    }
    if (block.type === "text" && typeof block.text === "string") {
      content.push({ type: "text", text: block.text });
      continue;
    }
    if (block.type === "image" && typeof block.data === "string" && typeof block.mimeType === "string") {
      content.push({ type: "image", data: block.data, mimeType: block.mimeType });
      continue;
    }
    content.push({ type: "text", text: textFromBlock(block) });
  }
  return content;
}

function resultContent(result: unknown): unknown[] {
  if (!isRecord(result) || !Array.isArray(result.content)) return [];
  return result.content;
}

export async function createMcpTools(client: McpClient, prefix = "chrome"): Promise<McpToolBundle> {
  const listed = await client.listTools();
  const usedNames = new Set<string>();
  const protectedToolKinds = new Map<string, ApprovalKind>();
  const tools = listed.tools.map((definition: McpToolDefinition) => {
    const name = safeToolName(definition.name, usedNames, prefix);
    protectedToolKinds.set(name, "browser");
    const parameters = Type.Unsafe(definition.inputSchema);
    const tool: AgentTool = {
      name,
      label: `Chrome ${definition.title ?? definition.name}`,
      description: `${definition.description ?? `Call the Chrome DevTools MCP tool ${definition.name}.`} Browser actions require approval.`,
      parameters,
      async execute(_toolCallId, params, signal): Promise<AgentToolResult<Record<string, unknown>>> {
        const result = await client.callTool(
          { name: definition.name, arguments: isRecord(params) ? params : {} },
          undefined,
          { signal },
        );
        const blocks = resultContent(result);
        const resultRecord: Record<string, unknown> = isRecord(result) ? result : {};
        const details = {
          source: "chrome-devtools",
          tool: definition.name,
          isError: resultRecord.isError === true,
          content: blocks,
        };
        if (resultRecord.isError === true) {
          throw new Error(`Chrome DevTools MCP tool ${definition.name} failed: ${blocks.map(textFromBlock).join("\n")}`);
        }
        const content = toAgentContent(blocks);
        if (content.length > 0) return { content, details };
        return {
          content: [{ type: "text", text: textFromBlock(resultRecord.structuredContent ?? result) }],
          details,
        };
      },
    };
    return tool;
  });

  return { tools, protectedToolKinds };
}

function defaultCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function defaultArgs(browserUrl: string): string[] {
  return ["-y", CHROME_DEVTOOLS_PACKAGE, "--slim", "--browser-url", browserUrl];
}

function resolveCommand(command: string): string {
  return process.platform === "win32" && command === "npx" ? "npx.cmd" : command;
}

export async function connectChromeDevToolsMcp(options: ChromeDevToolsMcpOptions = {}): Promise<ChromeDevToolsMcpConnection> {
  const transport = new StdioClientTransport({
    command: resolveCommand(options.command ?? defaultCommand()),
    args: options.args ?? defaultArgs(options.browserUrl ?? DEFAULT_CHROME_DEVTOOLS_BROWSER_URL),
    cwd: options.workspaceRoot,
    env: { ...getDefaultEnvironment(), ...options.env },
    stderr: "inherit",
  });
  const client = new Client({ name: "smith-agent", version: "0.1.0" });

  try {
    await client.connect(transport);
    const bundle = await createMcpTools(client);
    let closed = false;
    return {
      ...bundle,
      close: async () => {
        if (closed) return;
        closed = true;
        await client.close();
      },
    };
  } catch (error) {
    await client.close().catch(() => undefined);
    throw new Error(`Chrome DevTools MCP connection failed: ${errorMessage(error)}`);
  }
}

export function connectConfiguredChromeDevToolsMcp(server: McpServerConfig, workspaceRoot: string): Promise<ChromeDevToolsMcpConnection> {
  return connectChromeDevToolsMcp({ workspaceRoot, command: server.command, args: server.args, env: server.env });
}
