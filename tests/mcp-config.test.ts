import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadMcpConfig, McpConfigError } from "../src/mcp-config";
import { openWorkspace } from "../src/workspace";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeWorkspace(): Promise<{ directory: string; workspace: Awaited<ReturnType<typeof openWorkspace>> }> {
  const directory = await mkdtemp(join(tmpdir(), "smith-mcp-config-"));
  temporaryDirectories.push(directory);
  return { directory, workspace: await openWorkspace(directory) };
}

describe("MCP config", () => {
  test("loads configured MCP servers", async () => {
    const { directory, workspace } = await makeWorkspace();
    await writeFile(join(directory, "mcp.json"), JSON.stringify({
      mcpServers: {
        "chrome-devtools": {
          enabled: true,
          command: " npx ",
          args: ["-y", "chrome-devtools-mcp@latest"],
          env: { MCP_TEST: "value" },
        },
      },
    }));

    await expect(loadMcpConfig(workspace)).resolves.toEqual({
      mcpServers: {
        "chrome-devtools": {
          enabled: true,
          command: "npx",
          args: ["-y", "chrome-devtools-mcp@latest"],
          env: { MCP_TEST: "value" },
        },
      },
    });
  });

  test("returns an empty config when the file is absent", async () => {
    const { workspace } = await makeWorkspace();

    await expect(loadMcpConfig(workspace)).resolves.toEqual({});
  });

  test("rejects malformed server settings", async () => {
    const { directory, workspace } = await makeWorkspace();
    await writeFile(join(directory, "mcp.json"), '{"mcpServers":{"chrome-devtools":{"args":"npx"}}}');

    await expect(loadMcpConfig(workspace)).rejects.toBeInstanceOf(McpConfigError);
    await expect(loadMcpConfig(workspace)).rejects.toThrow("args must be an array of strings");
  });
});
