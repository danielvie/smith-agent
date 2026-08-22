# First POC for Smith Agent

- Label: `wayfinder:map`
- Status: open

## Destination

Produce an implementation-ready plan and validated technology choice for a Windows-first assistant-agent POC that can be the project entry point: a Bun executable, a Pi-backed agent core, a line-oriented terminal client, and a browser UI with rich rendering. The POC must exercise real trusted-workspace automation before production hardening begins.

## Notes

- Domain: local single-user project automation.
- Consulted skills: `domain-modeling`, `shared-understanding`, `research`, `grilling`.
- Windows is the first runtime target; Linux and macOS are build-check targets now and native runtime targets later.
- Prefer minimal code, explicit trust boundaries, exact dependency pins, and an app-owned protocol that can outlive Pi or Bun.
- Research: [technology-stack-options.md](../research/tech-stack-options.md), [pi-sdk-foundation.md](../research/pi-sdk-foundation.md).

## Decisions so far

- [Browser-based rich UI is acceptable for the POC](tickets/001-browser-rich-ui.md) — the executable may open an external browser; native desktop UI is deferred.
- [Selected Pi packages sit behind an application adapter](tickets/002-pi-adapter-foundation.md) — reuse `pi-agent-core` and `pi-ai`, not the full terminal CLI.
- [Bun is the primary runtime](tickets/003-bun-first-runtime.md) — write Node-compatible application code and compile immediately.
- [The POC validates real trusted-workspace automation](tickets/004-end-to-end-automation.md) — include read/write/edit, approved shell, one MCP stdio server, skills, steering, and both clients.
- [The workspace is one configurable canonical root](tickets/005-workspace-selection.md) — default to the launch directory with a `--workspace` override.
- [The security promise is approvals plus file containment](tickets/006-trusted-approval-boundary.md) — no OS-level sandbox claim in this POC.
- [Fireworks is the first model provider](tickets/007-openai-provider.md) — use Fireworks Kimi K2.6 first and keep provider selection behind Pi's model interface.
- [React is the browser UI framework](tickets/008-react-browser-frontend.md) — use focused Markdown, KaTeX, and chart renderers.
- [The terminal client is line-oriented](tickets/009-line-terminal-client.md) — rich presentation belongs in browser mode.
- [SSE and HTTP POST form the browser protocol](tickets/010-sse-http-transport.md) — stream events with SSE and send commands with POST.
- [Define and verify the Pi adapter contract](tickets/011-pi-adapter-contract.md) — pin Pi 0.84.2 packages behind app-owned session, event, and approval types.

## Not yet specified


- The built-in tool set, write/edit representation, approval state machine, and audit display.
- MCP stdio configuration, tool-name policy, server trust, and how MCP results enter Pi's tool loop.
- Skill discovery locations, precedence, project trust, and whether executable extensions are excluded from the POC.
- React asset bundling, browser-server routing, reconnect behavior, and safe rendering of model output.
- Windows executable smoke tests and cross-target build checks for Linux and macOS.
- The smallest end-to-end evaluation fixture and pass/fail criteria.

## Out of scope

- Native desktop/WebView UI or a universal binary.
- Multi-user authentication, remote hosting, or exposing the loopback server beyond localhost.
- Multiple model providers in the first POC.
- MCP registry discovery or Streamable HTTP in the first MCP integration.
- OS-level sandboxing; approvals are not presented as a sandbox.
- Full-screen terminal UI, saved sessions, telemetry, and production release automation.
