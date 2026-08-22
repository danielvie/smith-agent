# The workspace is one configurable canonical root

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

How should the agent choose project files when launched from arbitrary folders?

## Resolution

Default the workspace to the current directory, support a `--workspace <path>` override and equivalent configuration, canonicalize one root, and confine built-in file operations to it. Multi-root workspaces are deferred.
