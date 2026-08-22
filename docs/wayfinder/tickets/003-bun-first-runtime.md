# Bun is the primary runtime

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Should the TypeScript POC use Bun or Node.js as its primary runtime?

## Resolution

Use Bun first, write application code against Node-compatible APIs, and make `bun build --compile` a first acceptance gate. Build a Windows artifact for native smoke tests and keep Linux/macOS target builds as early packaging checks. Node remains a fallback, not a second supported runtime.
