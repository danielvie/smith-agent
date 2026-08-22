# Smith Agent

Windows-first proof of concept for a local assistant agent.

The first slice is intentionally small: a Bun executable, a Pi-backed agent adapter, the Fireworks Kimi K2.6 model, and a line-oriented terminal client operating on one configurable workspace root.

## Development

Requirements:

- Bun 1.4+
- Task 3+
- Fireworks API key

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

Use `--config <relative-path>` for another config file. `SMITH_MODEL` overrides the config file for one session. Keep API keys in `API_KEY_FIREWORKS`, not in the config file.

The current slice includes real workspace automation through `list_files`, `read_file`, `write_file`, `edit_file`, and approved `run_command` tools. Reads stay inside the canonical workspace root. Writes, edits, and shell commands ask for approval in the terminal.

The browser UI, MCP servers, skill discovery, and richer approval state model are still open POC work. The Pi adapter is kept behind `src/agent.ts` so those clients can use the same app-owned event and approval types.
