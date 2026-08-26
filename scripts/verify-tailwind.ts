import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";

const outputDirectory = "dist/tailwind-verify";
const output = `${outputDirectory}/styles.css`;

await mkdir(outputDirectory, { recursive: true });
const build = spawnSync(process.execPath, [
  "node_modules/@tailwindcss/cli/dist/index.mjs",
  "-i",
  "src/web/styles.css",
  "-o",
  output,
  "--minify",
], { stdio: "inherit" });

if (build.status !== 0) process.exit(build.status ?? 1);

const [actual, expected] = await Promise.all([
  readFile(output, "utf8"),
  readFile("src/web/styles.generated.css", "utf8"),
]);

await rm(outputDirectory, { recursive: true, force: true });

const normalizeLineEndings = (source: string) => source.replaceAll("\r\n", "\n");
if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
  throw new Error("Generated Tailwind CSS is stale. Run `npm run ui:css` and commit src/web/styles.generated.css.");
}

for (const utility of [".text-accent", ".max-w-measure", ".grid-rows-"]) {
  if (!actual.includes(utility)) throw new Error(`Tailwind output is missing ${utility}`);
}

console.log("Tailwind CSS is generated and current.");
