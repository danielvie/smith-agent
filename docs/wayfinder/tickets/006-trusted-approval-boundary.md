# The security promise is approvals plus file containment

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Does the POC require OS-level sandboxing, or is it a trusted single-user tool with approvals?

## Resolution

Treat the POC as a trusted single-user tool. Confine built-in filesystem operations to the workspace, require visible per-action approval for writes, shell, and MCP, show the requested action, and document that approval is not an OS-level sandbox.
