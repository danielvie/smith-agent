import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, relative } from "node:path";
import { build } from "esbuild";
import postject from "postject";

const requiredNodeVersion = "22.22.3";
if (process.versions.node !== requiredNodeVersion) {
  throw new Error(`Node ${requiredNodeVersion} is required to build this SEA; found ${process.versions.node}.`);
}
if (process.platform !== "win32" || process.arch !== "x64") {
  throw new Error(`The Windows x64 artifact must be built on Windows x64; found ${process.platform} ${process.arch}.`);
}

const seaDirectory = "dist/sea";
const bundlePath = `${seaDirectory}/smith.cjs`;
const blobPath = `${seaDirectory}/smith.blob`;
const configPath = `${seaDirectory}/sea-config.json`;
const executablePath = "dist/smith-windows-x64.exe";

async function assetFiles(root, directory = root, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await assetFiles(root, path, files);
    else if (entry.isFile()) files.push(relative(process.cwd(), path).replaceAll("\\", "/"));
  }
  return files;
}

await rm(seaDirectory, { recursive: true, force: true });
await rm(executablePath, { force: true });
await mkdir(seaDirectory, { recursive: true });

await build({
  entryPoints: ["src/cli.ts"],
  outfile: bundlePath,
  bundle: true,
  format: "cjs",
  platform: "node",
  target: ["node22.22"],
  minify: false,
  sourcemap: false,
  define: {
    "process.env.NODE_ENV": '"production"',
    "import.meta.url": "__filename",
  },
});

const embeddedFiles = await Promise.all([assetFiles("skills"), assetFiles("stearing")]);
const embeddedAssets = Object.fromEntries(embeddedFiles.flat().map((path) => [path, path]));
await writeFile(configPath, `${JSON.stringify({
  main: bundlePath,
  output: blobPath,
  disableExperimentalSEAWarning: true,
  useSnapshot: false,
  useCodeCache: false,
  assets: {
    "ui/index.html": "dist/ui/index.html",
    "ui/client.js": "dist/ui/client.js",
    "ui/client.css": "dist/ui/client.css",
    ...embeddedAssets,
  },
}, null, 2)}\n`);

const sea = spawnSync(process.execPath, ["--experimental-sea-config", configPath], { stdio: "inherit" });
if (sea.status !== 0) throw new Error(`Node SEA blob generation failed with exit code ${sea.status ?? "unknown"}.`);

await copyFile(process.execPath, executablePath);
const { inject } = postject;
await inject(executablePath, "NODE_SEA_BLOB", await readFile(blobPath), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
});

console.log(`Built ${executablePath} with Node ${requiredNodeVersion}.`);
