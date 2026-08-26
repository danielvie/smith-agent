import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_HOME = join(homedir(), ".agents");

function readInstruction(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const content = readFileSync(path, "utf8").trim();
  return content || undefined;
}

export function loadGlobalAgentInstructions(agentHome = AGENT_HOME): string | undefined {
  return readInstruction(join(agentHome, "AGENTS.md"));
}
