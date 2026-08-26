import { access } from "node:fs/promises";
import type { Workspace } from "./workspace";

export const DEFAULT_MCP_CONFIG_PATH = "mcp.json";

export interface McpServerConfig {
  enabled?: boolean;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers?: Record<string, McpServerConfig>;
}

export class McpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpConfigError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function parseServer(value: unknown, path: string): McpServerConfig {
  if (!isRecord(value)) throw new McpConfigError(`${path} must be a JSON object.`);
  if (value.enabled !== undefined && typeof value.enabled !== "boolean") {
    throw new McpConfigError(`${path}.enabled must be a boolean.`);
  }
  if (value.command !== undefined && !nonEmptyString(value.command)) {
    throw new McpConfigError(`${path}.command must be a non-empty string.`);
  }
  if (value.args !== undefined && (!Array.isArray(value.args) || value.args.some((arg) => typeof arg !== "string"))) {
    throw new McpConfigError(`${path}.args must be an array of strings.`);
  }
  if (value.env !== undefined && (!isRecord(value.env) || Object.values(value.env).some((entry) => typeof entry !== "string"))) {
    throw new McpConfigError(`${path}.env must be an object with string values.`);
  }

  return {
    ...(value.enabled === undefined ? {} : { enabled: value.enabled }),
    ...(value.command === undefined ? {} : { command: value.command.trim() }),
    ...(value.args === undefined ? {} : { args: [...value.args] as string[] }),
    ...(value.env === undefined ? {} : { env: { ...value.env } as Record<string, string> }),
  };
}

export async function loadMcpConfig(workspace: Workspace, relativePath = DEFAULT_MCP_CONFIG_PATH): Promise<McpConfig> {
  const configPath = workspace.resolvePath(relativePath);
  try {
    await access(configPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  const file = await workspace.readFile(relativePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch (error) {
    throw new McpConfigError(`Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) throw new McpConfigError(`${relativePath} must contain a JSON object.`);
  if (parsed.mcpServers === undefined) return {};
  if (!isRecord(parsed.mcpServers)) throw new McpConfigError(`${relativePath}.mcpServers must be a JSON object.`);

  const mcpServers: Record<string, McpServerConfig> = {};
  for (const [name, value] of Object.entries(parsed.mcpServers)) {
    mcpServers[name] = parseServer(value, `${relativePath}.mcpServers.${name}`);
  }
  return { mcpServers };
}
