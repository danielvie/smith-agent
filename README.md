# Smith Agent

Windows-first proof of concept for a local assistant agent.

The first slice is intentionally small: a Node single executable application, a Pi-backed agent adapter, BCAI and Fireworks model providers, and terminal/browser clients operating on one configurable workspace root.

## Development

Requirements:

- Node.js 22.22.3
- npm 10+
- Task 3+
- BCAI UDAL token in `UDAL_PAT`, or a Fireworks API key when using Fireworks
- A browser for UI mode

```powershell
$env:UDAL_PAT = "<your BCAI UDAL token>"
task init
task run
```

The current directory is the workspace by default. Use `--workspace <path>` when starting from another folder.

```powershell
npm run run -- --workspace C:\path\to\project
```

Model settings live in `smith.config.json` at the workspace root:

```json
{
  "model": "gpt-5.6-luna"
}
```

BCAI is the default provider. It sends `gpt-5.6-luna` requests to `https://bcai-openai-proxy-test.taspre-phx.apps.boeing.com/v1` and reads its UDAL token from `UDAL_PAT`.

Fireworks remains available. Select a Fireworks model such as `accounts/fireworks/models/kimi-k2p6` and set `API_KEY_FIREWORKS` or `FIREWORKS_API_KEY`.

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

Use `--config <relative-path>` or `--mcp-config <relative-path>` to select another config file. `SMITH_MODEL` overrides the model for one session. Keep `UDAL_PAT` and Fireworks keys in the environment, not in a config file.

## Personal instructions and NIMT

Smith loads `~/.agents/AGENTS.md` into each new agent session. For NIMT work items, test artifacts, or the meetings log, it exposes a `load_skill` tool that loads `~/.agents/skills/nimt-project/SKILL.md` only when needed. The skill's helper-script directory is returned with its instructions.

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

Smith stores resumable sessions under `.smith/sessions/`. It resumes the most recently updated session by default; if that session is open in another Smith instance, it starts a new session instead. Session files contain the model transcript and UI history, and `.smith/` is ignored by Git because conversations can contain sensitive data.

The UI has a session picker plus New and Delete buttons. Delete confirms before removing the active session and creates a replacement when the last session is removed. In the CLI:

```powershell
npm run run -- --new-session
npm run run -- --session <session-id>
```

While running the CLI, use `/sessions`, `/new`, or `/resume <session-id>` to switch sessions. Switching is disabled while a run is active.

In the browser UI, paste PNG, JPEG, or WebP screenshots into the message composer. Smith inserts an `Image` token at the caret; click the token to toggle its preview. A prompt can include up to four screenshots with a combined size of 5 MB.

Use `Edit` on a sent message to branch from that point. Smith removes that prompt and all later history from the active session, restores the Pi context before it, and puts the old text in the composer for editing. Sending it creates the new continuation.

## Browser UI

Start the local browser client with:

```powershell
task ui
```

Or run it without opening a browser automatically:

```powershell
npm run ui -- --no-open --port 3210
```

The UI binds to `127.0.0.1`, streams events with SSE, queues prompts sent during an active run, and supports aborts, tool approvals, Markdown, LaTeX, and JSON ECharts blocks. Queued prompts can be edited or canceled before execution:

````markdown
```chart
{"title":{"text":"Example"},"xAxis":{"type":"category","data":["A","B"]},"yAxis":{},"series":[{"type":"bar","data":[3,5]}]}
```
````

## Windows single executable

Build the Node SEA with the required Node version:

```powershell
npm ci
npm run build:windows
```

The output is `dist/smith-windows-x64.exe`. The executable contains the Node runtime, server bundle, npm runtime dependencies, and browser assets. It still uses an installed browser and reads credentials and workspace configuration from the environment and selected workspace.

```powershell
$env:UDAL_PAT = "<your BCAI UDAL token>"
.\dist\smith-windows-x64.exe --ui --workspace C:\path\to\project
```

Build each operating-system artifact on that operating system. Sign the final executable after SEA injection if it will be distributed.

## Chrome DevTools MCP

Chrome web tools are enabled by the `chrome-devtools` entry in `mcp.json`. The current config uses `--browser-url http://127.0.0.1:9222`, so Chrome must already be running with remote debugging enabled on that port.

Smith launches the configured MCP command, discovers its tools, prefixes them with `chrome_`, and routes browser actions through the existing approval flow. To let the MCP server manage its own browser, replace the browser URL arguments with `--headless` in `mcp.json`.

Run the live integration check with:

```powershell
$env:SMITH_MCP_INTEGRATION = "1"
npm test -- tests/mcp.integration.test.ts
```

The check navigates to a Google search through Smith's MCP bridge and reads the returned page text. With the current config, Chrome must be reachable at `http://127.0.0.1:9222` before running it.

The Pi adapter and MCP bridge stay behind `src/agent.ts` and `src/mcp.ts` so terminal and browser clients use the same app-owned event and approval types. Terminal mode renders completed Markdown blocks, including GitHub-flavored tables, before tool calls and when a run finishes.
