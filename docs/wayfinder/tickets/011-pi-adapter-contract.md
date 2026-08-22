# Define and verify the Pi adapter contract

- Label: `wayfinder:research`
- Status: resolved
- Assignee: `zed-agent`
- Parent: [First POC for Smith Agent](../map.md)

## Question

Which exact Pi package versions and application-owned types are sufficient for model streaming, tool calls, tool progress, steering, cancellation, approvals, and errors without leaking Pi types into the host or clients?

## Resolution

Use the pinned `@earendil-works/pi-agent-core@0.84.2` and `@earendil-works/pi-ai@0.84.2` packages behind `src/agent.ts`. Register only the Fireworks provider in the first slice and pass `models.streamSimple.bind(models)` to Pi's `Agent`.

The host-facing boundary is app-owned: `SmithAgentSession`, `SmithEvent`, `ApprovalRequest`, `ApprovalHandler`, and `AgentConfigurationError`. Pi events map to status, text, thinking, tool-start, tool-update, tool-end, and error events. Session methods expose prompt, steering, follow-up, abort, and event subscription without returning Pi message or event types.

Workspace tools are built separately and passed into Pi as `AgentTool` values. The `beforeToolCall` hook is the approval boundary for writes, edits, and shell commands. Missing Fireworks credentials fail before the session starts. Provider and tool failures remain visible through the adapter event path.

Verified with `bun test` (8 passing), `bun run check`, `bun run build:windows`, `task check`, `task test`, and a piped `task run` startup/exit smoke test. Browser transport, MCP, skills, and the full approval state model remain separate open tickets.
