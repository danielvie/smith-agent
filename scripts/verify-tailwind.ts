import { mkdir, readFile, rm } from "node:fs/promises";

const outputDirectory = "dist/tailwind-verify";
const output = `${outputDirectory}/styles.css`;

await mkdir(outputDirectory, { recursive: true });
const build = Bun.spawnSync([
  process.execPath,
  "x",
  "tailwindcss",
  "-i",
  "src/web/styles.css",
  "-o",
  output,
  "--minify",
], { stdout: "inherit", stderr: "inherit" });

if (build.exitCode !== 0) process.exit(build.exitCode);

const [actual, expected] = await Promise.all([
  readFile(output, "utf8"),
  readFile("src/web/styles.generated.css", "utf8"),
]);

await rm(outputDirectory, { recursive: true, force: true });

const normalizeLineEndings = (source: string) => source.replaceAll("\r\n", "\n");
if (normalizeLineEndings(actual) !== normalizeLineEndings(expected)) {
  throw new Error("Generated Tailwind CSS is stale. Run `pnpm run ui:css` and commit src/web/styles.generated.css.");
}

for (const utility of [".text-accent", ".max-w-measure", ".grid-rows-"]) {
  if (!actual.includes(utility)) throw new Error(`Tailwind output is missing ${utility}`);
}

console.log("Tailwind CSS is generated and current.");
