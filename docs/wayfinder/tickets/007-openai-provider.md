# Fireworks is the first model provider

- Label: `wayfinder:grilling`
- Status: closed
- Parent: [First POC for Smith Agent](../map.md)

## Question

Should the first POC support one configured provider or multiple providers, and which provider is first?

## Resolution

Configure Fireworks first through Pi's model abstraction. Use `fireworksProvider()` with the pinned Pi package and default to `accounts/fireworks/models/kimi-k2p6` (Kimi K2.6). Read `API_KEY_FIREWORKS`, with `FIREWORKS_API_KEY` as a compatibility fallback. Do not build multi-provider UX yet; preserve the provider seam for later selection.
