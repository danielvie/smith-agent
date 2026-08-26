import { describe, expect, test } from "bun:test";
import { renderTerminalMarkdown, TerminalMarkdownOutput } from "../src/terminal-markdown";

describe("terminal Markdown output", () => {
  test("renders GitHub-flavored tables with borders", () => {
    const rendered = renderTerminalMarkdown([
      "| Feature | Estado | Responsável |",
      "| --- | --- | --- |",
      "| 7252229 | Active | Não atribuído |",
    ].join("\n"), 80);

    expect(rendered).toContain("┌─────────┬────────┬───────────────┐");
    expect(rendered).toContain("│ Feature │ Estado │ Responsável   │");
    expect(rendered).toContain("│ 7252229 │ Active │ Não atribuído │");
    expect(rendered).toContain("└─────────┴────────┴───────────────┘");
  });

  test("flushes Markdown before tool output and when the run completes", () => {
    const chunks: string[] = [];
    const terminal = new TerminalMarkdownOutput({ write: (chunk) => chunks.push(chunk) });

    terminal.writeEvent({ type: "text_delta", delta: "| Name | State |\n| --- | --- |\n| Smith | Ready |" });
    terminal.writeEvent({ type: "tool_start", toolCallId: "call-1", toolName: "read_file", args: { path: "README.md" } });
    terminal.writeEvent({ type: "tool_end", toolCallId: "call-1", toolName: "read_file", result: {}, isError: false });
    terminal.writeEvent({ type: "text_delta", delta: "Done." });
    terminal.writeEvent({ type: "status", status: "completed" });

    expect(chunks[0]).toContain("┌───────┬───────┐");
    expect(chunks[1]).toBe('[tool read_file] {"path":"README.md"}\n');
    expect(chunks[2]).toBe("[tool read_file done]\n");
    expect(chunks[3]).toBe("Done.\n");
  });
});
