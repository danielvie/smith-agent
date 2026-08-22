# SSE and HTTP POST form the browser protocol

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Should browser communication use SSE plus commands, WebSocket, or Pi RPC directly?

## Resolution

Use SSE for streamed server-to-browser events and HTTP POST for prompts, steering, approvals, and cancellation. Keep the browser protocol application-owned rather than exposing Pi RPC as the product contract.
