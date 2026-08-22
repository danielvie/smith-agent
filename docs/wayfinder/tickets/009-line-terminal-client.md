# The terminal client is line-oriented

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Should the POC build a full-screen TUI, reuse Pi's terminal UI, or keep terminal mode simple?

## Resolution

Use a Pi-like line-oriented CLI with streamed output, tool/approval status, and commands such as `/ui`, `/workspace`, and `/exit`. Put rich rendering in browser mode; defer a full-screen TUI.
