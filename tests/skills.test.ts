import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createInstructionTools, skillIdentificationPrompt } from "../src/agent";
import { loadBundledSkills, loadSkillCatalog } from "../src/skills";

const temporaryDirectories: string[] = [];

function skillFile(name: string, description: string, body = "Follow the bundled instructions."): string {
  return `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`;
}

async function writeSkill(root: string, directory: string, name = directory, description = `${name} description`): Promise<string> {
  const skillDirectory = join(root, directory);
  await mkdir(join(skillDirectory, "scripts"), { recursive: true });
  await writeFile(join(skillDirectory, "SKILL.md"), skillFile(name, description));
  await writeFile(join(skillDirectory, "scripts", "helper.mjs"), "console.log('helper');\n");
  return skillDirectory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("skill catalog", () => {
  test("loads Smith-owned skills and their files from the repository", () => {
    const skills = loadBundledSkills();
    const nimt = skills.find((skill) => skill.name === "nimt-project");

    expect(nimt).toMatchObject({ source: "bundled", description: expect.stringContaining("NIMT data") });
    expect(nimt?.files?.has("scripts/ado.mjs")).toBe(true);
    expect(nimt?.files?.has("scripts/meetings_log.py")).toBe(true);
  });

  test("disables automatic skills without hiding bundled skills", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-skills-"));
    temporaryDirectories.push(directory);
    const bundledRoot = join(directory, "bundled");
    const agentHome = join(directory, "agent-home");
    await writeSkill(bundledRoot, "bundled-one");
    await writeSkill(join(agentHome, "skills"), "external-one");

    expect(loadSkillCatalog({ skillsRoot: bundledRoot, agentHome, disableAutomaticDetection: true }).map((skill) => skill.name)).toEqual(["bundled-one"]);
    expect(loadSkillCatalog({ skillsRoot: bundledRoot, agentHome }).map((skill) => skill.name)).toEqual(["bundled-one", "external-one"]);
  });

  test("bundled skills win name collisions with automatically detected skills", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-skills-"));
    temporaryDirectories.push(directory);
    const bundledRoot = join(directory, "bundled");
    const agentHome = join(directory, "agent-home");
    await writeSkill(bundledRoot, "shared", "shared", "bundled description");
    await writeSkill(join(agentHome, "skills"), "shared", "shared", "external description");

    const skills = loadSkillCatalog({ skillsRoot: bundledRoot, agentHome });
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: "shared", description: "bundled description", source: "bundled" });
  });

  test("identifies and loads a registered bundled skill", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-skills-"));
    temporaryDirectories.push(directory);
    const bundledRoot = join(directory, "bundled");
    const skillDirectory = await writeSkill(bundledRoot, "review", "review", "Review code changes.");
    const skills = loadSkillCatalog({ skillsRoot: bundledRoot, disableAutomaticDetection: true });

    expect(skillIdentificationPrompt(skills)).toContain("review: Review code changes.");
    const tool = createInstructionTools(skills)[0];
    const result = await tool.execute("skill-call", { name: "review" });
    expect(result.details).toMatchObject({ name: "review", source: "bundled", directory: skillDirectory });
    expect(await readFile(join((result.details as { directory: string }).directory, "scripts", "helper.mjs"), "utf8")).toContain("helper");
  });
});
