import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAsset, getAssetKeys, isSea } from "node:sea";
import { AGENT_HOME } from "./instructions";

const SKILL_FILE = "SKILL.md";
const SEA_SKILLS_PREFIX = "skills/";

export interface RegisteredSkill {
  name: string;
  description: string;
  instructions: string;
  source: "bundled" | "automatic";
  directory?: string;
  bundledDirectory?: string;
  files?: ReadonlyMap<string, Uint8Array>;
}

export interface LoadedSkill {
  name: string;
  description: string;
  instructions: string;
  source: RegisteredSkill["source"];
  directory: string;
}

export interface SkillCatalogOptions {
  disableAutomaticDetection?: boolean;
  skillsRoot?: string;
  agentHome?: string;
}

function frontmatterValue(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "mu"));
  if (!match) return undefined;
  return match[1].trim().replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2");
}

function parseSkill(instructions: string, fallbackName: string): { name: string; description: string } {
  const match = instructions.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u);
  if (!match) throw new Error(`${SKILL_FILE} for ${fallbackName} must start with YAML frontmatter.`);
  const name = frontmatterValue(match[1], "name") ?? fallbackName;
  const description = frontmatterValue(match[1], "description");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name)) throw new Error(`Invalid skill name: ${name}.`);
  if (!description) throw new Error(`Skill ${name} must have a description in ${SKILL_FILE}.`);
  return { name, description };
}

function sourceSkillsRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../skills");
}

function collectFiles(root: string, current = root, files = new Map<string, Uint8Array>()): Map<string, Uint8Array> {
  if (!existsSync(current)) return files;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) collectFiles(root, path, files);
    else if (entry.isFile()) files.set(relative(root, path).replaceAll("\\", "/"), readFileSync(path));
  }
  return files;
}

function bundledFiles(skillsRoot?: string): Map<string, Uint8Array> {
  if (!isSea()) return collectFiles(skillsRoot ?? sourceSkillsRoot());
  const files = new Map<string, Uint8Array>();
  for (const key of getAssetKeys().filter((asset) => asset.startsWith(SEA_SKILLS_PREFIX)).sort()) {
    files.set(key.slice(SEA_SKILLS_PREFIX.length), new Uint8Array(getAsset(key)));
  }
  return files;
}

export function loadBundledSkills(skillsRoot?: string): RegisteredSkill[] {
  const files = bundledFiles(skillsRoot);
  const directories = [...new Set([...files.keys()].map((path) => path.split("/")[0]))].sort();
  const skills = directories.map((bundledDirectory) => {
    const skillFile = files.get(`${bundledDirectory}/${SKILL_FILE}`);
    if (!skillFile) throw new Error(`Bundled skill ${bundledDirectory} is missing ${SKILL_FILE}.`);
    const instructions = new TextDecoder().decode(skillFile).trim();
    const metadata = parseSkill(instructions, bundledDirectory);
    const skillFiles = new Map<string, Uint8Array>();
    for (const [path, content] of files) {
      if (path.startsWith(`${bundledDirectory}/`)) skillFiles.set(path.slice(bundledDirectory.length + 1), content);
    }
    return {
      ...metadata,
      instructions,
      source: "bundled" as const,
      ...(!isSea() ? { directory: join(skillsRoot ?? sourceSkillsRoot(), bundledDirectory) } : {}),
      bundledDirectory,
      files: skillFiles,
    };
  });
  const names = new Set<string>();
  for (const skill of skills) {
    if (names.has(skill.name)) throw new Error(`Duplicate bundled skill name: ${skill.name}.`);
    names.add(skill.name);
  }
  return skills;
}

export function detectAutomaticSkills(agentHome = AGENT_HOME): RegisteredSkill[] {
  const root = join(agentHome, "skills");
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const directory = join(root, entry.name);
      const path = join(directory, SKILL_FILE);
      if (!existsSync(path)) return [];
      const instructions = readFileSync(path, "utf8").trim();
      if (!instructions) return [];
      return [{ ...parseSkill(instructions, entry.name), instructions, source: "automatic" as const, directory }];
    });
}

export function loadSkillCatalog(options: SkillCatalogOptions = {}): RegisteredSkill[] {
  const skills = loadBundledSkills(options.skillsRoot);
  if (options.disableAutomaticDetection) return skills;
  const names = new Set(skills.map((skill) => skill.name));
  for (const skill of detectAutomaticSkills(options.agentHome)) {
    if (!names.has(skill.name)) skills.push(skill);
  }
  return skills;
}

export async function loadRegisteredSkill(skill: RegisteredSkill): Promise<LoadedSkill> {
  if (skill.directory) {
    return { name: skill.name, description: skill.description, instructions: skill.instructions, source: skill.source, directory: skill.directory };
  }
  if (!skill.files || !skill.bundledDirectory) throw new Error(`Bundled skill ${skill.name} has no embedded files.`);

  const hash = createHash("sha256");
  for (const [path, content] of [...skill.files].sort(([left], [right]) => left.localeCompare(right))) {
    hash.update(path).update(content);
  }
  const directory = join(tmpdir(), "smith-agent-skills", hash.digest("hex").slice(0, 16), skill.bundledDirectory);
  await Promise.all([...skill.files].map(async ([path, content]) => {
    const output = join(directory, ...path.split("/"));
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, content);
  }));
  return { name: skill.name, description: skill.description, instructions: skill.instructions, source: skill.source, directory };
}
