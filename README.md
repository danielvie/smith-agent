# Smith Agent

Windows-first proof of concept for a local assistant agent.

The first slice is intentionally small: a Bun executable, a Pi-backed agent adapter, the Fireworks Kimi K2.6 model, and terminal/browser clients operating on one configurable workspace root.

## Development

Requirements:

- Bun 1.4+
- Task 3+
- Fireworks API key
- A browser for UI mode

```powershell
$env:API_KEY_FIREWORKS = "<your key>"
task run
```

The current directory is the workspace by default. Use `--workspace <path>` when starting from another folder.

```powershell
bun run src/cli.ts --workspace C:\path\to\project
```

Model settings live in `smith.config.json` at the workspace root:

```json
{
  "model": "accounts/fireworks/models/kimi-k2p6",
  "chromeDevtools": false
}
```

Use `--config <relative-path>` for another config file. `SMITH_MODEL` overrides the config file for one session. Keep `API_KEY_FIREWORKS` and the optional `BRAVE_API_KEY` in environment variables, not in the config file.

The current slice includes real workspace automation through `list_files`, `read_file`, `search`, `write_file`, `edit_file`, and approved `run_command` tools, plus optional `web_search` and `web_content` tools. Reads and local search stay inside the canonical workspace root. Writes, edits, shell commands, browser actions, and web requests ask for approval.

## Web search

Set `BRAVE_API_KEY` to enable public web search through the Brave Search API. Smith exposes `web_search` for source-backed results and optional bounded page text, and `web_content` for a known public URL. These calls are approval-gated and keep the key server-side.

```powershell
$env:BRAVE_API_KEY = "<your Brave key>"
task run
```

Chrome DevTools MCP remains the option for interactive pages, screenshots, and login-dependent browsing.

## Browser UI

Start the local browser client with:

```powershell
task ui
```

Or run it without opening a browser automatically:

```powershell
bun run src/cli.ts --ui --no-open --port 3210
```

The UI binds to `127.0.0.1`, streams events with SSE, queues prompts sent during an active run, and supports aborts, tool approvals, Markdown, LaTeX, and JSON ECharts blocks. Queued prompts can be edited or canceled before execution:

````markdown
```chart
{"title":{"text":"Example"},"xAxis":{"type":"category","data":["A","B"]},"yAxis":{},"series":[{"type":"bar","data":[3,5]}]}
```
````

## Chrome DevTools MCP

Chrome web tools are optional. Start Chrome with remote debugging on `127.0.0.1:9222`, then enable the bridge with either `--chrome-devtools`, `SMITH_CHROME_DEVTOOLS=true`, or `"chromeDevtools": true` in `smith.config.json`:

```powershell
bun run src/cli.ts --chrome-devtools
bun run src/cli.ts --ui --chrome-devtools
```

Smith launches `npx -y chrome-devtools-mcp@latest --slim --browser-url http://127.0.0.1:9222`, discovers its tools, prefixes them with `chrome_`, and routes browser actions through the existing approval flow. This requires `npx`, network access on first launch, and a Chrome instance with remote debugging enabled.

The Pi adapter and MCP bridge stay behind `src/agent.ts` and `src/mcp.ts` so terminal and browser clients use the same app-owned event and approval types.
