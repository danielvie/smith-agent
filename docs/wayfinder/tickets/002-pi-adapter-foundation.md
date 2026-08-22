# Selected Pi packages sit behind an application adapter

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Should the POC adopt the full Pi coding-agent CLI, reuse lower-level Pi packages, or build the agent core from scratch?

## Resolution

Use exact-pinned `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` behind an application-owned adapter. Reuse selected Pi resource/skill loading only where useful. The host owns UI, MCP, workspace policy, approvals, and the public event protocol. Do not adopt the full terminal-first CLI or expose Pi types at application boundaries.
