import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getAsset, getAssetKeys, isSea } from "node:sea";

const SEA_PREFIX = "stearing/";

function sourceRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../stearing");
}

function sourceFiles(root: string, current = root, files: Array<{ path: string; content: Uint8Array }> = []): Array<{ path: string; content: Uint8Array }> {
  if (!existsSync(current)) return files;
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) sourceFiles(root, path, files);
    else if (entry.isFile()) files.push({ path: relative(root, path).replaceAll("\\", "/"), content: readFileSync(path) });
  }
  return files;
}

export function loadStearingInstructions(root?: string): string | undefined {
  const files = isSea()
    ? getAssetKeys()
      .filter((key) => key.startsWith(SEA_PREFIX))
      .map((key) => ({ path: key.slice(SEA_PREFIX.length), content: new Uint8Array(getAsset(key)) }))
    : sourceFiles(root ?? sourceRoot());
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const instructions = files
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => decoder.decode(file.content).trim())
    .filter(Boolean);
  return instructions.length > 0 ? instructions.join("\n\n") : undefined;
}
