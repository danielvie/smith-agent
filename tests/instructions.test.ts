import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NIMT_PROJECT_SKILL_NAME, loadGlobalAgentInstructions, loadNimtProjectSkill } from "../src/instructions";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("agent instructions", () => {
  test("loads global instructions and the NIMT skill", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-instructions-"));
    temporaryDirectories.push(directory);
    const skillDirectory = join(directory, "skills", NIMT_PROJECT_SKILL_NAME);
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(directory, "AGENTS.md"), "Use concise responses.");
    await writeFile(join(skillDirectory, "SKILL.md"), "Use the ADO script.");

    expect(loadGlobalAgentInstructions(directory)).toBe("Use concise responses.");
    expect(loadNimtProjectSkill(directory)).toEqual({
      directory: skillDirectory,
      instructions: "Use the ADO script.",
      commands: {
        ado: `node \"${join(skillDirectory, "scripts", "ado.mjs")}\"`,
        meetingsLog: `uv run \"${join(skillDirectory, "scripts", "meetings_log.py")}\"`,
      },
    });
  });

  test("returns undefined when personal instructions are unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-instructions-"));
    temporaryDirectories.push(directory);

    expect(loadGlobalAgentInstructions(directory)).toBeUndefined();
    expect(loadNimtProjectSkill(directory)).toBeUndefined();
  });
});
