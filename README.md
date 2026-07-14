# Smith Agent (PoC)

A small Rust CLI that validates whether a read-only coding agent on
Fireworks AI (Kimi K2.6) is worth building out. It answers questions about
the directory it is started in by letting the model call three confined,
read-only filesystem tools. See
[docs/POC-IMPLEMENTATION-PLAN.md](docs/POC-IMPLEMENTATION-PLAN.md) for the
full plan and [CONTEXT.md](CONTEXT.md) for terminology.

**This is a proof of concept, not a production agent.** No file writes, no
shell commands, no saved sessions.

The PoC passed its evaluation gate (see below), after which the original
line-based REPL was upgraded to a full-screen terminal UI built on
[ratatui](https://ratatui.rs): a scrollable transcript, a live status line
with colored activity (magenta while the model thinks, yellow per tool
action), and a persistent input box.

## Requirements

- Rust (stable toolchain)
- [Task](https://taskfile.dev) (optional; plain `cargo` works too)
- A Fireworks AI API key

## Setup

Set the API key in PowerShell:

```powershell
$env:API_KEY_FIREWORKS = "<your Fireworks API key>"
```

To persist it across sessions:

```powershell
[Environment]::SetEnvironmentVariable("API_KEY_FIREWORKS", "<key>", "User")
```

## Run

Start the CLI in the directory you want to investigate — the launch
directory becomes the workspace root and tools cannot read outside it:

```powershell
task run          # or: cargo run --quiet
```

The app takes over the terminal: header with workspace and model, the
conversation transcript in the middle, a status line showing what the agent
is doing right now, and the input box at the bottom.

| Key                 | Action                                  |
| ------------------- | --------------------------------------- |
| `Enter`             | Send the prompt                         |
| `↑` / `↓`           | Scroll the transcript by one line       |
| `PgUp` / `PgDn`     | Scroll the transcript by one page       |
| `Esc`               | Jump back to the latest output          |
| `Ctrl+C` or `/exit` | Quit                                    |

While a run is active the status line animates: **Thinking...** (magenta)
during model rounds and the current tool action (yellow), e.g.
`Reading src/main.rs`. Tool actions also stay in the transcript as yellow
`•` lines; errors appear in red. One run at a time — typing stays available
but submits are ignored until the answer finishes.

## Tasks

| Task         | Purpose                        |
| ------------ | ------------------------------ |
| `task`       | List tasks                     |
| `task run`   | Run the CLI                    |
| `task test`  | Run all automated tests        |
| `task check` | Type-check all targets         |
| `task clean` | Remove build artifacts         |

## Tools available to the model

| Tool           | Behavior                                                                 |
| -------------- | ------------------------------------------------------------------------ |
| `list_files`   | Recursive listing, skips `.git`/`target`, max 500 paths                  |
| `read_file`    | UTF-8 files up to 128 KiB, line-numbered output                          |
| `search_files` | Case-sensitive literal substring search, max 100 matches                 |

All paths are validated against the canonical workspace root: absolute
paths, `..` traversal, and symlinks that escape the root are rejected. The
agent aborts a run after 12 model rounds.

## PoC evaluation (I6)

Run the CLI inside `tests/fixtures/sample-project` (a tiny Python
temperature converter) and record pass/fail here.

| # | Scenario                                                                  | Result |
|---|---------------------------------------------------------------------------|--------|
| 1 | "Explain this repository's structure and main execution flow."            | pass (2026-07-13) |
| 2 | "Where is the absolute-zero validation implemented, and how does it work?" | pass (2026-07-13) |
| 3 | "What does `convert(100, 'c', 'f')` return, and which files define it?"    | pass (2026-07-13) |

All three answers were factually correct for the fixture, cited the right
file paths with line numbers, streamed the final text, and scenarios 2 and 3
ran back-to-back in one session. Path confinement (`..`, absolute paths,
escaping symlinks) is covered by the automated tests.

Each scenario passes when: at least one model-directed tool call occurred,
the answer is factually correct for the fixture, relevant file paths are
cited, activity animation is visible with streamed final text, and the next
prompt works in the same session. Path confinement is additionally covered
by automated tests (`cargo test tools`).

## Known limitations

- Repository content can prompt-inject the model; read-only tools cap impact.
- Conversation history is unbounded for the session.
- Literal search only; no regex and no `.gitignore` handling beyond skipping
  `.git` and `target`.
- Tool execution is sequential; API calls can be slow (10-minute read
  timeout).
