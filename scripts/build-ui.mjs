import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { build } from "esbuild";

const outputDirectory = "dist/ui";
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  entryPoints: ["src/web/client.tsx"],
  outfile: `${outputDirectory}/client.js`,
  bundle: true,
  format: "esm",
  jsx: "automatic",
  minify: true,
  platform: "browser",
  target: ["es2022"],
  define: { "process.env.NODE_ENV": '"production"' },
  loader: {
    ".woff": "dataurl",
    ".woff2": "dataurl",
    ".ttf": "dataurl",
  },
});

const template = await readFile("src/web/index.html", "utf8");
const html = template
  .replace("./styles.generated.css", "/client.css")
  .replace("./client.tsx", "/client.js");
await writeFile(`${outputDirectory}/index.html`, html);

console.log(`Built browser UI in ${outputDirectory}.`);
