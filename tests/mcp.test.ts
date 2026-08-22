import { describe, expect, test } from "bun:test";
import { createMcpTools, type McpClient } from "../src/mcp";

describe("MCP tool bridge", () => {
  test("exposes discovered tools with browser approval metadata", async () => {
    const client = {
      listTools: async () => ({
        tools: [{
          name: "navigate_page",
          title: "Navigate page",
          description: "Open a page in Chrome.",
          inputSchema: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        }],
      }),
      callTool: async (request: { name: string; arguments?: Record<string, unknown> }) => ({
        content: [{ type: "text", text: `opened ${String(request.arguments?.url)}` }],
      }),
      close: async () => undefined,
    } as unknown as McpClient;

    const bundle = await createMcpTools(client);
    expect(bundle.tools.map((tool) => tool.name)).toEqual(["chrome_navigate_page"]);
    expect(bundle.protectedToolKinds.get("chrome_navigate_page")).toBe("browser");

    const result = await bundle.tools[0].execute("call-1", { url: "https://example.com" });
    expect(result.content).toEqual([{ type: "text", text: "opened https://example.com" }]);
    expect(result.details).toMatchObject({ source: "chrome-devtools", tool: "navigate_page", isError: false });
  });
});
