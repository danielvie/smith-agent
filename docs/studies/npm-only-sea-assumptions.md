# npm-only Node SEA assumptions

This study targets the `study/npm-only-sea` worktree.

## Confirmed constraints

- Build and development commands use npm. Bun and pnpm are not required.
- The build runtime is exactly Node.js 22.22.3 on Windows x64.
- The deliverable is one Windows executable at `dist/smith-windows-x64.exe`.
- The executable starts Smith's existing loopback browser UI. It does not package a browser.
- The executable reads workspace configuration, credentials, approvals, instructions, and sessions from the selected workspace or the user's environment. Those files are user data, not packaged application files.
- Optional MCP servers remain external processes. The executable can start them from `mcp.json`, but it does not package `npx`, Chrome, or MCP server packages.

## Implementation assumptions

- A platform-specific SEA is acceptable. Node SEA embeds the current Node executable, so Windows, Linux, and macOS artifacts must be built on their matching platforms.
- Node's SEA runtime can load one bundled CommonJS entrypoint. esbuild bundles the TypeScript server and npm dependencies before Node injects that bundle.
- Browser assets are built with esbuild and embedded with the SEA asset mechanism. Source development reads the same assets from `dist/ui`.
- The machine's default corporate npm mirror lacks some pinned packages. This project uses `https://registry.npmjs.org/`, matching its previous install command, and keeps the Pi packages at 0.84.2.
- Model interaction requires a valid `UDAL_PAT`, `API_KEY_FIREWORKS`, or `FIREWORKS_API_KEY`. Credentials stay outside the executable.
- Code signing is outside this study. Injecting the SEA blob changes the copied Node binary, so a release pipeline must sign the finished executable after injection.

## Acceptance checks

1. `npm ci` installs from `package-lock.json` without Bun or pnpm.
2. `npm test` and `npm run check` pass on Node 22.22.3.
3. `npm run build:windows` creates one executable containing the server, dependencies, and browser assets.
4. The executable starts with `--ui --no-open`, serves the UI and API, and accepts a prompt.
5. With configured credentials, a prompt returns a model response through the browser API.

## Verification result

All five checks passed on Node 22.22.3. The final executable served its embedded HTML, JavaScript, and CSS, returned UI state from `/api/state`, accepted `Reply with exactly SEA_FINAL_OK` through `/api/prompt`, and returned `SEA_FINAL_OK` from the configured BCAI model.
