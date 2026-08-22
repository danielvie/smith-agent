# React is the browser UI framework

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Should rich mode use React, vanilla TypeScript, or another browser UI framework?

## Resolution

Use React + TypeScript, bundled with the Bun toolchain, with focused renderers for Markdown, KaTeX math, and ECharts charts. Avoid adding a general state-management framework until the event model needs one.
