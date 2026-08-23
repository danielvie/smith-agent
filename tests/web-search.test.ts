import { describe, expect, test } from "bun:test";
import { createWebTools } from "../src/web-search";

describe("web search tools", () => {
  test("maps Brave results and bounded page content into structured output", async () => {
    const urls: string[] = [];
    const responses = [
      new Response(JSON.stringify({ web: { results: [{ title: "Example", url: "https://example.com/article", description: "A result", age: "today" }] } }), {
        headers: { "content-type": "application/json" },
      }),
      new Response("<html><head><title>Example Article</title></head><body><nav>noise</nav><main><h1>Hello</h1><p>Readable content.</p></main></body></html>", {
        headers: { "content-type": "text/html" },
      }),
    ];
    const fetcher = async (input: string | URL) => {
      urls.push(String(input));
      const response = responses.shift();
      if (!response) throw new Error("unexpected fetch");
      return response;
    };

    const bundle = createWebTools({ apiKey: "test-brave-key", fetch: fetcher });
    expect(bundle.protectedToolKinds.get("web_search")).toBe("web");
    const searchTool = bundle.tools.find((tool) => tool.name === "web_search");
    if (!searchTool) throw new Error("web_search tool was not created");

    const result = await searchTool.execute("call-1", { query: "smith", count: 1, includeContent: true });
    expect(result.details).toMatchObject({
      provider: "brave",
      query: "smith",
      results: [{ title: "Example", url: "https://example.com/article", snippet: "A result", age: "today", content: "Hello\nReadable content." }],
    });
    expect(urls[0]).toContain("q=smith");
    expect(urls[0]).toContain("count=1");
  });

  test("blocks local page URLs before making a request", async () => {
    const contentTool = createWebTools({ fetch: async () => new Response("unexpected") }).tools.find((tool) => tool.name === "web_content");
    if (!contentTool) throw new Error("web_content tool was not created");

    await expect(contentTool.execute("call-1", { url: "http://127.0.0.1:9222/json" })).rejects.toThrow("Local and private network URLs");
  });

  test("requires the Brave credential at execution time", async () => {
    const searchTool = createWebTools({ fetch: async () => new Response() }).tools.find((tool) => tool.name === "web_search");
    if (!searchTool) throw new Error("web_search tool was not created");

    await expect(searchTool.execute("call-1", { query: "smith" })).rejects.toThrow("BRAVE_API_KEY is required");
  });
});
