import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

if (process.platform !== "win32") throw new Error("The Windows SEA check must run on Windows.");

const workspace = await mkdtemp(join(tmpdir(), "smith-sea-"));
const executable = resolve("dist/smith-windows-x64.exe");
const child = spawn(executable, ["--ui", "--no-open", "--port", "0", "--workspace", workspace], {
  env: { ...process.env, UDAL_PAT: process.env.UDAL_PAT || "sea-smoke-test" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});

let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { stdout += chunk; });
child.stderr.on("data", (chunk) => { stderr += chunk; });

try {
  const url = await new Promise((resolveUrl, reject) => {
    const timeout = setTimeout(() => reject(new Error(`SEA UI did not start.\n${stdout}${stderr}`)), 20_000);
    const inspect = () => {
      const match = stdout.match(/Smith UI: (http:\/\/127\.0\.0\.1:\d+\/)/u);
      if (!match) return;
      clearTimeout(timeout);
      resolveUrl(match[1]);
    };
    child.stdout.on("data", inspect);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`SEA UI exited with code ${code}.\n${stdout}${stderr}`));
    });
  });

  const [page, script, styles, state] = await Promise.all([
    fetch(url),
    fetch(new URL("client.js", url)),
    fetch(new URL("client.css", url)),
    fetch(new URL("api/state", url)),
  ]);
  const html = await page.text();
  const stateBody = await state.json();
  if (!page.ok || !html.includes("Smith Agent") || !script.ok || !styles.ok || !state.ok || stateBody.model !== "gpt-5.6-luna") {
    throw new Error("SEA UI smoke check failed.");
  }
  console.log(`Verified ${executable}: embedded UI and API are reachable.`);
} finally {
  child.kill();
  await rm(workspace, { recursive: true, force: true });
}
