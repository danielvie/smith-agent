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
  "model": "accounts/fireworks/models/kimi-k2p6"
}
```

MCP servers live in `mcp.json` at the workspace root:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest", "--slim", "--browser-url", "http://127.0.0.1:9222"]
    }
  }
}
```

Use `--config <relative-path>` or `--mcp-config <relative-path>` to select another config file. `SMITH_MODEL` overrides the model for one session. Keep `API_KEY_FIREWORKS` in the environment, not in a config file.

The current slice includes real workspace automation through `list_files`, `read_file`, `search`, `write_file`, `edit_file`, and approved `run_command` tools, plus optional Chrome DevTools MCP tools for web research and browser interaction. Reads and local search stay inside the canonical workspace root. Writes, edits, shell commands, and browser actions ask for approval.

Chrome DevTools MCP is the only web-browsing path. It supports interactive pages, screenshots, and login-dependent browsing.

## Approvals

Protected tools ask for approval. Choose `Always approve` in the UI, or type `a` in the CLI, to persist an exact tool name in `approvals.json`:

```json
{
  "alwaysApprove": ["chrome_navigate"]
}
```

The rule applies to every future call of that tool in the current workspace. Remove the tool name from `approvals.json` to require approval again. This does not approve other tools or restrict the tool's arguments.

## Sessions

Smith stores resumable sessions under `.smith/sessions/`. It resumes the most recently updated session by default. Session files contain the model transcript and UI history, and `.smith/` is ignored by Git because conversations can contain sensitive data.

The UI has a session picker and a New button. In the CLI:

```powershell
bun run src/cli.ts --new-session
bun run src/cli.ts --session <session-id>
```

While running the CLI, use `/sessions`, `/new`, or `/resume <session-id>` to switch sessions. Switching is disabled while a run is active.

In the browser UI, use `Edit` on a sent message to branch from that point. Smith removes that prompt and all later history from the active session, restores the Pi context before it, and puts the old text in the composer for editing. Sending it creates the new continuation.

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

Chrome web tools are enabled by the `chrome-devtools` entry in `mcp.json`. The current config uses `--browser-url http://127.0.0.1:9222`, so Chrome must already be running with remote debugging enabled on that port.

Smith launches the configured MCP command, discovers its tools, prefixes them with `chrome_`, and routes browser actions through the existing approval flow. To let the MCP server manage its own browser, replace the browser URL arguments with `--headless` in `mcp.json`.

Run the live integration check with:

```powershell
$env:SMITH_MCP_INTEGRATION = "1"
bun test tests/mcp.integration.test.ts
```

The check navigates to a Google search through Smith's MCP bridge and reads the returned page text. With the current config, Chrome must be reachable at `http://127.0.0.1:9222` before running it.

The Pi adapter and MCP bridge stay behind `src/agent.ts` and `src/mcp.ts` so terminal and browser clients use the same app-owned event and approval types.
