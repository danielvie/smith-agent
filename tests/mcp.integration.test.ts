import { describe, expect, test } from "vitest";
import { connectConfiguredChromeDevToolsMcp, type ChromeDevToolsMcpConnection } from "../src/mcp";
import { loadMcpConfig } from "../src/mcp-config";
import { openWorkspace } from "../src/workspace";

const runLiveTest = test.skipIf(process.env.SMITH_MCP_INTEGRATION !== "1");

function resultText(result: unknown): string {
  if (result === null || typeof result !== "object") return String(result);
  const record = result as { content?: unknown[]; details?: unknown };
  const content = Array.isArray(record.content) ? record.content : [];
  const text = content.map((block) => {
    if (block !== null && typeof block === "object" && "text" in block && typeof block.text === "string") return block.text;
    return JSON.stringify(block);
  });
  return text.join("\n") || JSON.stringify(record.details ?? result);
}

describe("Chrome DevTools MCP live integration", () => {
  runLiveTest("performs a Google search through Smith's MCP bridge", async () => {
    const workspace = await openWorkspace(process.cwd());
    const config = await loadMcpConfig(workspace);
    const server = config.mcpServers?.["chrome-devtools"];
    if (!server || server.enabled === false) throw new Error("mcp.json must enable the chrome-devtools server for this test.");

    let connection: ChromeDevToolsMcpConnection | undefined;
    try {
      connection = await connectConfiguredChromeDevToolsMcp(server, workspace.root);
      const tools = new Map(connection.tools.map((tool) => [tool.name, tool]));
      const navigate = tools.get("chrome_navigate");
      const evaluate = tools.get("chrome_evaluate");
      if (!navigate || !evaluate) {
        throw new Error(`Chrome DevTools MCP did not expose the required tools. Available tools: ${[...tools.keys()].join(", ")}`);
      }

      const query = "Smith Agent Chrome DevTools MCP";
      const navigation = await navigate.execute("live-google-navigation", {
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      });
      expect(navigation.details).toMatchObject({ source: "chrome-devtools", tool: "navigate", isError: false });

      const page = await evaluate.execute("live-google-evaluate", {
        script: "document.body.innerText",
      });
      const pageText = resultText(page);
      expect(pageText).toMatch(/google/i);
      expect(pageText).toMatch(/Smith Agent|Chrome DevTools|MCP/i);
    } finally {
      await connection?.close();
    }
  }, 30_000);
});
