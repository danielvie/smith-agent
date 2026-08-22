# Browser-based rich UI is acceptable for the POC

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Must rich mode be a native window with no external browser, or may the POC start a loopback server and open the user's browser?

## Resolution

The POC may use an external browser. The standalone executable bundles the agent, local server, and frontend assets; the browser is an explicit prerequisite. Native desktop packaging is deferred.
