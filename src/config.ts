import type { Workspace } from "./workspace";

export const DEFAULT_CONFIG_PATH = "smith.config.json";

export interface SmithConfig {
  model?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function loadSmithConfig(workspace: Workspace, relativePath = DEFAULT_CONFIG_PATH): Promise<SmithConfig> {
  const configPath = workspace.resolvePath(relativePath);
  if (!(await Bun.file(configPath).exists())) return {};

  const file = await workspace.readFile(relativePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch (error) {
    throw new ConfigError(`Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) throw new ConfigError(`${relativePath} must contain a JSON object.`);
  if (parsed.model === undefined) return {};
  if (typeof parsed.model !== "string" || !parsed.model.trim()) {
    throw new ConfigError(`${relativePath}.model must be a non-empty string.`);
  }

  return { model: parsed.model.trim() };
}
