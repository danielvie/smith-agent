# Pi web-search-subagent: source trail and Smith fit

**Research date:** 2026-08-22

## Scope

This research checked the current Pi source repository and the skill repository that Pi's own skills documentation links to. The requested name, `web-search-subagent`, does not appear in the current `main` tree of [`badlogic/pi-skills`](https://api.github.com/repos/badlogic/pi-skills/git/trees/main?recursive=1), and guessed paths in the current Pi repository return 404. There is no verified official skill file with that name to copy.

The closest official implementations are two separate skills:

- `brave-search`, a provider-backed search and page-content CLI.
- `browser-tools`, a direct Chrome DevTools Protocol automation CLI.

Neither skill defines a Pi child agent, subagent prompt, or registered search tool. Each is a `SKILL.md` instruction file plus local JavaScript helpers.

## Executive recommendation

Do not copy a nonexistent `web-search-subagent` path. Treat `brave-search` and `browser-tools` as two different capabilities:

1. Add explicit Smith-owned `web_search` and `web_content` tools if provider-backed search is required.
2. Keep Chrome DevTools MCP for interactive browser work. It is a browser transport, not a search provider.
3. Implement the web tools in Smith's Bun/TypeScript runtime, or wrap the reviewed scripts behind a tightly bounded subprocess adapter. Do not make arbitrary skill scripts a permission boundary.
4. Keep the first version as ordinary tools in the existing Pi agent session. Add a separate research subagent only if delegation, parallel searches, or isolated context becomes a demonstrated requirement.

The provider credential is a product decision. Brave requires a separate `BRAVE_API_KEY`; Smith's existing Fireworks key cannot authenticate it. Browser automation instead depends on a local Chrome instance and possibly copied browser cookies.

## What Pi skills actually provide

Pi's [skills documentation](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md) defines a skill as a directory containing `SKILL.md`. The file requires `name` and `description` frontmatter. Helper files are resolved relative to the skill directory, so commands such as `{baseDir}/search.js` refer to files shipped beside that `SKILL.md`.

The loader discovers skills from Pi and project locations, package resources, settings, and explicit CLI paths. The model reads the full skill content when it needs it. The loader does not turn a JavaScript helper into a typed agent tool. A skill can contain executable code or instruct the model to run commands, so Pi's documentation warns that skill content must be reviewed before it is trusted.

Pi's documentation links to [`badlogic/pi-skills`](https://github.com/badlogic/pi-skills) as the skill repository. The current tree contains `brave-search` and `browser-tools`, but no `web-search-subagent` directory or file. The current Pi repository itself contains only its sample `.pi/skills` content relevant to this search, not the requested skill.

Sources:

- [Pi skills documentation](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md)
- [Pi skill loader](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/skills.ts)
- [Pi resource loader](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/resource-loader.ts)
- [Pi skill repository](https://github.com/badlogic/pi-skills)
- [Current Pi Skills tree](https://api.github.com/repos/badlogic/pi-skills/git/trees/main?recursive=1)

## Official implementation: `brave-search`

### Skill instructions

[`brave-search/SKILL.md`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/SKILL.md) declares:

```yaml
name: brave-search
description: Web search and content extraction via Brave Search API. Use for searching documentation, facts, or any web content. Lightweight, no browser required.
```

Setup requires a Brave Search API account, a subscription, an API key, and this environment variable:

```text
BRAVE_API_KEY
```

The skill tells the agent to run `npm install` in the skill directory and invoke the scripts directly. Its documented commands are:

```text
search.js "query"
search.js "query" -n 10
search.js "query" --content
search.js "query" --freshness pw
search.js "query" --country DE
content.js https://example.com/article
```

The script is therefore a Node subprocess assumption. The skill itself does not invoke an API through Pi agent-core and does not define a JSON tool schema.

### Search implementation

[`brave-search/search.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/search.js) calls the official Brave endpoint:

```text
https://api.search.brave.com/res/v1/web/search
```

It sends `q`, `count`, and `country` query parameters, optionally `freshness`, and authenticates with the `X-Subscription-Token` header set from `BRAVE_API_KEY`. It caps the requested count sent to Brave at 20. The script maps each Brave web result to `title`, `link`, `snippet`, and `age`.

With `--content`, it fetches each result URL sequentially. It uses `fetch` with a ten-second timeout, Mozilla Readability, and a fallback that removes `script`, `style`, `noscript`, `nav`, `header`, `footer`, and `aside` before selecting `main`, `article`, `[role='main']`, `.content`, `#content`, or the body. Extracted content is capped at 5,000 characters per result. Failures become strings such as `(HTTP 404)` or `(Error: ...)` inside the result output.

The normal output is human-readable text, not JSON:

```text
--- Result 1 ---
Title: Page Title
Link: https://example.com/page
Age: 2 days ago
Snippet: Description from search results
Content:
Markdown or extracted text when --content is used
```

If there are no results, the script prints `No results found.` and exits successfully. Configuration and request failures go to stderr and exit nonzero.

### Standalone content extraction

[`brave-search/content.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/content.js) takes one URL, fetches it with a browser-like user agent, and uses the same Readability plus Turndown/GFM conversion. It prints an optional Markdown title followed by the extracted content. Its fallback uses the same main-content selectors, but it does not apply the 5,000-character cap used by `search.js`.

This script also uses a ten-second fetch timeout and reports HTTP or extraction failures on stderr. It is a page-content helper, not a search provider.

### Dependencies and runtime

[`brave-search/package.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/package.json) declares these direct dependencies:

- `@mozilla/readability` `^0.6.0`
- `jsdom` `^27.0.1`
- `turndown` `^7.2.2`
- `turndown-plugin-gfm` `^1.0.2`

The checked [`package-lock.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/package-lock.json) pins the resolved dependency graph. The scripts use ESM, `fetch`, `AbortSignal.timeout`, and Node's executable-script convention. They are not a Pi-specific package and do not depend on MCP.

## Official implementation: `browser-tools`

### Skill instructions

[`browser-tools/SKILL.md`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/SKILL.md) describes interactive browser automation through Chrome DevTools Protocol. It says to run `npm install` in the skill directory, start Chrome on port `9222`, and then use helper scripts for navigation, evaluation, screenshots, element picking, cookies, and readable content extraction.

The skill's examples use `{baseDir}/browser-*.js`. It is a collection of shell-invoked scripts, not an MCP server and not a Pi subagent.

### Browser connection and startup assumptions

The helper scripts use `puppeteer-core` and connect to:

```text
http://localhost:9222
```

[`browser-start.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-start.js) is particularly environment-specific. It:

- uses `${HOME}/.cache/browser-tools` for a profile;
- invokes `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`;
- starts Chrome with `--remote-debugging-port=9222`;
- optionally copies the user's macOS Chrome profile with `--profile`, including cookies and logins;
- uses shell commands such as `mkdir`, `rm`, and `rsync`;
- waits up to roughly 15 seconds for the debugging endpoint.

As written, that startup script is macOS-specific. The other helpers assume that Chrome is already available at port 9222. They do not use Smith's Chrome DevTools MCP bridge.

### Helper commands and output contracts

- [`browser-nav.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-nav.js) accepts a URL plus `--new` and `--reload`. It prints `Opened:` or `Navigated to:` with a checkmark on success. It reuses the last tab unless `--new` is supplied.
- [`browser-eval.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-eval.js) evaluates arbitrary JavaScript in the active tab. Primitive values print directly. Objects print one `key: value` line per property, and arrays of objects are separated by blank lines.
- [`browser-pick.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-pick.js) injects a page overlay and lets a user select one or more DOM elements. It prints fields such as `tag`, `id`, `class`, `text`, `html`, and `parents` in the same line-oriented format.
- [`browser-screenshot.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-screenshot.js) saves a PNG in the OS temporary directory and prints the path.
- [`browser-cookies.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-cookies.js) prints cookie names, raw values, domains, paths, and security flags. This is sensitive output and should not be exposed as a normal research result.
- [`browser-content.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-content.js) navigates to a URL, extracts the final URL and optional title, and prints readable Markdown. It waits for `networkidle2` or ten seconds, has a 30-second process timeout, and uses a fallback content selector when Readability fails.
- [`browser-hn-scraper.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/browser-hn-scraper.js) is a separate Hacker News scraper. It fetches `https://news.ycombinator.com` directly with `fetch` and Cheerio, so it does not use the browser connection. Its stdout is a JSON array of objects with `id`, `title`, `url`, `points`, `author`, `time`, `comments`, and `hnUrl`; status text goes to stderr.

### Dependencies and credentials

[`browser-tools/package.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/package.json) declares:

- `@mozilla/readability` `^0.6.0`
- `cheerio` `^1.1.2`
- `jsdom` `^27.0.1`
- `puppeteer` `^24.31.0`
- `puppeteer-core` `^23.11.1`
- `puppeteer-extra` `^3.3.6`
- `puppeteer-extra-plugin-stealth` `^2.11.2`
- `turndown` `^7.2.2`
- `turndown-plugin-gfm` `^1.0.2`

The checked [`package-lock.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/package-lock.json) records the resolved graph. The fetched helpers mainly use `puppeteer-core`, Readability, JSDOM, Turndown, and Cheerio. The browser skill has no API-key environment variable. Authentication comes from the active Chrome profile when `--profile` is used. The cookie helper can disclose those credentials, so it should not be exposed without an explicit security policy.

## Assumption comparison

| Concern | Pi skill collection | Smith today |
|---|---|---|
| Search provider | Brave Search API, via `search.js` | No Brave or other web-search provider. `src/workspace.ts` searches local UTF-8 workspace files only. |
| Browser | Optional separate Chrome/CDP scripts, normally on `localhost:9222` | Optional Chrome DevTools MCP in `src/mcp.ts`, launched through `npx` and MCP stdio. |
| MCP | None in either skill. Browser helpers call Puppeteer directly. | Uses `@modelcontextprotocol/sdk`; discovers and prefixes Chrome MCP tools with `chrome_`. |
| Process model | Shell invokes Node scripts from the skill directory after `npm install` | Bun/ESM TypeScript app; shell is an approved `run_command` tool with bounded timeout/output. |
| Credentials | `BRAVE_API_KEY` for Brave; optional Chrome profile cookies/logins for browser tools | Fireworks model key from `apiKey`, `API_KEY_FIREWORKS`, or `FIREWORKS_API_KEY`; Chrome remains an external browser. |
| Dependencies | Per-skill npm installations, with the package-lock graphs above | `@earendil-works/pi-agent-core` and `pi-ai` `0.84.2`, MCP TypeScript SDK, and browser/UI dependencies in `package.json`; no Brave client. |
| Tool schema | Human-readable CLI arguments and text/JSON stdout conventions | Typed Pi `AgentTool` definitions and Smith's approval hooks. |
| Output contract | Brave search uses delimited text; standalone content uses Markdown; HN uses JSON; browser helpers use ad hoc text | `src/protocol.ts` emits Smith status, prompt, text/thinking delta, tool, approval, and error events. The web UI renders generic formatted tool values, not a search-result schema. |
| Subagent behavior | No subagent or child-agent implementation found in the official skill files | One Pi-backed Smith agent session. Extra tools can be injected, but there is no web-search subagent. |

## Smith comparison

The current application already has the right host boundaries for an integration, but not the search capability itself:

- `package.json` uses Bun scripts and ESM TypeScript. It pins `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` at `0.84.2` and already depends on the official MCP TypeScript SDK.
- `src/agent.ts` creates the Pi `Agent`, uses Fireworks, and reads the model credential from the Smith-specific options or Fireworks environment variables. Its system prompt tells the model to use `search` for local text and Chrome DevTools tools for web research when available. It does not claim that Chrome MCP is a search API.
- `src/workspace.ts` enforces relative paths, rejects absolute and parent paths, bounds files and command output, and implements regex/literal/glob local search. That `search` tool must not be relabeled as web search.
- `src/mcp.ts` launches `npx -y chrome-devtools-mcp@latest --slim --browser-url http://127.0.0.1:9222` through `StdioClientTransport`, discovers the MCP tools, prefixes them with `chrome_`, and marks browser actions for approval. This is an MCP bridge around Chrome, not the direct Puppeteer approach used by `browser-tools`.
- `src/server.ts` and `README.md` make Chrome optional and document the external-browser, `npx`, network, and remote-debugging requirements.
- `src/protocol.ts` and `src/web/client.tsx` already carry approval and generic tool-result events. The UI renders Markdown, LaTeX, and fenced JSON ECharts blocks, but it has no dedicated web-result presentation or provider error type.

## Implementation recommendation

If Smith needs search, add the smallest host-owned interface that matches the actual product need:

1. Add a `web_search` tool with query, result count, country, freshness, and an optional content flag. Add a separate `web_content` tool for fetching a known URL. Return structured objects containing title, URL, snippet, age, and optional Markdown content. This is safer and easier to evolve than parsing the Brave script's human-readable stdout.
2. Use `BRAVE_API_KEY` as a separate server-side credential and call Brave's documented endpoint directly with `fetch`. Keep the count cap, request timeouts, response-size limits, and clear provider errors from the reviewed script. Do not reuse the Fireworks model key.
3. Keep Chrome DevTools MCP for pages that need JavaScript interaction, visible browser state, login cookies, screenshots, or user selection. Do not assume that Chrome MCP supplies a search engine. If browser navigation or arbitrary page fetching is exposed, keep it behind Smith's existing approval and network policy.
4. Do not use `src/workspace.ts` `search` for web search. Its containment guarantees are valuable for local files and irrelevant to remote web results.
5. Prefer native Bun/TypeScript code. If a subprocess wrapper is chosen for compatibility with the Pi scripts, install and pin the Node dependencies explicitly, invoke only fixed script paths, validate arguments, bound stdin/stdout/stderr and process time, pass only the required credential, and translate nonzero exits into Smith tool errors. Do not allow the model to choose an arbitrary script or working directory.
6. Treat web output as untrusted input. Preserve source URLs, avoid presenting fetched HTML as trusted markup, and keep cookies and API keys out of tool results and transcript logs.
7. Start with ordinary explicit tools, not a hidden autonomous subagent. A separate subagent is justified later if Smith needs parallel source collection, independent context, or a stable research synthesis workflow. Its final output contract should then be defined by Smith rather than inherited from Pi's line-oriented scripts.

This keeps Pi responsible for agent looping and model/tool calls while Smith retains ownership of credentials, subprocess policy, network policy, approvals, event translation, and UI rendering.

## Primary sources

Pi:

- [Pi repository](https://github.com/earendil-works/pi)
- [Pi skills documentation](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/skills.md)
- [Pi skill loader](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/skills.ts)
- [Pi resource loader](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/resource-loader.ts)
- [Pi-linked skill repository](https://github.com/badlogic/pi-skills)
- [Pi Skills `main` tree](https://api.github.com/repos/badlogic/pi-skills/git/trees/main?recursive=1)

Pi Skills files:

- [`brave-search/SKILL.md`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/SKILL.md)
- [`brave-search/search.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/search.js)
- [`brave-search/content.js`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/content.js)
- [`brave-search/package.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/package.json)
- [`brave-search/package-lock.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/brave-search/package-lock.json)
- [`browser-tools/SKILL.md`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/SKILL.md)
- [`browser-tools` scripts](https://github.com/badlogic/pi-skills/tree/main/browser-tools)
- [`browser-tools/package.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/package.json)
- [`browser-tools/package-lock.json`](https://raw.githubusercontent.com/badlogic/pi-skills/main/browser-tools/package-lock.json)

Smith sources inspected:

- `package.json`
- `README.md`
- `src/agent.ts`
- `src/mcp.ts`
- `src/server.ts`
- `src/workspace.ts`
- `src/protocol.ts`
- `src/web/client.tsx`
