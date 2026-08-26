import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
import type { SmithEvent } from "./protocol";

const identity = (text: string) => text;

const terminalMarkdownTheme: MarkdownTheme = {
  heading: identity,
  link: identity,
  linkUrl: identity,
  code: identity,
  codeBlock: identity,
  codeBlockBorder: identity,
  quote: identity,
  quoteBorder: identity,
  hr: identity,
  listBullet: identity,
  bold: identity,
  italic: identity,
  strikethrough: identity,
  underline: identity,
};

export interface TextWriter {
  write(chunk: string): unknown;
}

export function renderTerminalMarkdown(source: string, width = process.stdout.columns ?? 80): string {
  if (!source.trim()) return "";

  return new Markdown(source.trim(), 0, 0, terminalMarkdownTheme)
    .render(Math.max(1, width))
    .map((line) => line.trimEnd())
    .join("\n");
}

export class TerminalMarkdownOutput {
  private markdown = "";

  constructor(private readonly writer: TextWriter) {}

  writeEvent(event: SmithEvent): void {
    switch (event.type) {
      case "text_delta":
        this.markdown += event.delta;
        break;
      case "thinking_delta":
      case "tool_update":
        break;
      case "tool_start":
        this.flush();
        this.writer.write(`[tool ${event.toolName}] ${JSON.stringify(event.args)}\n`);
        break;
      case "tool_end":
        this.writer.write(`[tool ${event.toolName} ${event.isError ? "failed" : "done"}]\n`);
        break;
      case "error":
        this.flush();
        this.writer.write(`[agent error] ${event.message}\n`);
        break;
      case "status":
        if (event.status === "completed") this.flush();
        break;
    }
  }

  flush(): void {
    const rendered = renderTerminalMarkdown(this.markdown);
    this.markdown = "";
    if (rendered) this.writer.write(`${rendered}\n`);
  }
}
