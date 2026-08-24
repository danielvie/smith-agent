import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const AGENT_HOME = join(homedir(), ".agents");
export const NIMT_PROJECT_SKILL_NAME = "nimt-project";

export interface NimtProjectSkill {
  directory: string;
  instructions: string;
  commands: {
    ado: string;
    meetingsLog: string;
  };
}

function readInstruction(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const content = readFileSync(path, "utf8").trim();
  return content || undefined;
}

export function loadGlobalAgentInstructions(agentHome = AGENT_HOME): string | undefined {
  return readInstruction(join(agentHome, "AGENTS.md"));
}

export function loadNimtProjectSkill(agentHome = AGENT_HOME): NimtProjectSkill | undefined {
  const directory = join(agentHome, "skills", "nimt-project");
  const instructions = readInstruction(join(directory, "SKILL.md"));
  if (!instructions) return undefined;
  return {
    directory,
    instructions,
    commands: {
      ado: `node "${join(directory, "scripts", "ado.mjs")}"`,
      meetingsLog: `uv run "${join(directory, "scripts", "meetings_log.py")}"`,
    },
  };
}
