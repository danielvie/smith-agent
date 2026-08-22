# Pi SDK as the foundation for the agent POC

**Research date:** 2026-08-22

## Scope

This research evaluates whether the Pi coding-agent ecosystem should replace a custom agent foundation for a POC with these requirements:

1. A terminal mode that starts from arbitrary folders and supports configurable workspace containment.
2. A browser UI with Markdown, charts, and LaTeX.
3. Skills, MCP, user steering, and approvals.
4. Streaming agent events.
5. A path to distribution as a standalone executable.

The assumption is that "Pi SDK" means the Pi coding-agent ecosystem that historically used the `@mariozechner/pi-*` packages, especially `pi-coding-agent`, `pi-agent-core`, and `pi-ai`. That assumption is correct, but the upstream project and package names have moved:

- Current repository: [`earendil-works/pi`](https://github.com/earendil-works/pi).
- Historical repository: [`badlogic/pi-mono`](https://github.com/badlogic/pi-mono).
- Current package names: `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, and `@earendil-works/pi-ai`.
- The historical `@mariozechner/*` packages remain published, but npm marks them deprecated in favor of the `@earendil-works/*` packages.
- The current package version checked for the main packages is `0.84.2`.

The assessment below uses the current repository and versioned package sources where possible. It does not treat unversioned `main` documentation as a promise of API stability.

## Executive recommendation

**Use selected lower-level Pi packages behind an internal application interface. Do not adopt the full coding-agent CLI as the application foundation.**

Use:

- `@earendil-works/pi-agent-core` for the agent loop, state, tools, steering and follow-up queues, tool hooks, abort handling, and lifecycle events.
- `@earendil-works/pi-ai` for provider/model abstraction, authentication, streaming, tool schemas, usage accounting, and model catalogs.
- Selected `@earendil-works/pi-coding-agent` resource-loading and session pieces only where they save POC work, especially skills and session behavior.

Own the following in the application:

- Browser rendering and browser transport.
- MCP client/server integration and server configuration.
- Workspace containment and path authorization.
- Shell policy and tool approvals.
- The event protocol exposed to terminal and browser clients.
- The stable internal interface that isolates the application from Pi's pre-1.0 API changes.

Pi removes a large amount of model-provider and agent-loop work. It does not provide the two hardest application-specific boundaries here: a browser product UI and a real filesystem/process security policy. Its explicit "No MCP" and "No permission popups" positions also make a full CLI adoption a poor fit for the requested POC.

## Requirement comparison

| Requirement | Pi fit | Recommendation |
|---|---|---|
| Terminal mode from arbitrary folders | Good. The coding-agent SDK accepts a working directory, and the process can be launched from the current directory. | Use the SDK or core, but define the workspace explicitly in the host. |
| Configurable workspace containment | Incomplete. `cwd` determines the base used by tools; it is not a containment policy. Absolute paths, path traversal, links, and shell commands need host enforcement. | Use custom root-aware tools or replace/delegate every filesystem and shell operation. |
| Browser UI with Markdown, charts, and LaTeX | Incomplete. `pi-agent-core` is UI-independent, but the coding-agent UI is terminal-first. | Build the browser UI and its renderer in the application. |
| Skills | Strong. Pi implements the Agent Skills convention and has resource loaders, discovery rules, package resources, and extension APIs. | Reuse the loader selectively. Treat project-local skills as untrusted instructions unless the host trusts them. |
| MCP | Deliberately absent. The coding-agent README says "No MCP" and recommends an extension/package instead. | Add MCP in the application or an isolated extension using the official MCP SDK. |
| Steering and approvals | Steering and follow-up queues are built into `pi-agent-core`. General approvals are not. Tool-call hooks and RPC prompts can support approvals. | Use Pi's control primitives, but implement the approval state machine and policy in the host. |
| Provider/model abstraction | Strong. `pi-ai` covers multiple providers, custom providers, auth, streaming, schemas, models, and usage. | Reuse `pi-ai` behind an internal model interface. |
| Streaming and events | Strong. `Agent.subscribe()` exposes lifecycle, message, tool execution, and update events. | Map Pi events to an application event protocol before sending them to clients. |
| Filesystem and shell tools | Broad but permissive. Built-ins cover read/write/edit/search/listing and `bash`, but run with Pi process permissions. | Do not use the defaults as a security boundary. |
| Embedding in another app | Good. The SDK exposes `createAgentSession()`, direct session/core access, and RPC. Client/server packages are intended as building blocks, with the server still experimental. | Embed core/runtime pieces; do not make the experimental server package the application's security model. |
| Standalone executable | Viable, not automatic. Pi builds target-specific Bun binaries, but releases also contain assets and native sidecars. A browser remains external. | Validate Bun compilation early and package per OS/architecture. |
| License | MIT for the repository and published packages checked. | Redistribution is permitted with the required notices. Audit transitive dependencies separately. |

## Detailed findings

### Upstream identity and package layout

Pi started under `badlogic/pi-mono` and is now maintained in `earendil-works/pi`. The package rename matters for a new POC. New dependencies should use the current `@earendil-works/*` names, not the deprecated `@mariozechner/*` names.

The three relevant layers have different jobs:

- `pi-agent-core` contains the model/tool loop and evented agent state.
- `pi-ai` contains provider and model concerns.
- `pi-coding-agent` adds the coding-agent application layer, resource loading, built-in coding tools, sessions, terminal UI integration, and command modes.

That separation is useful. It means the POC does not have to take the terminal UI just to reuse the loop and model layer.

Sources:

- [Current Pi repository](https://github.com/earendil-works/pi)
- [Historical Pi repository](https://github.com/badlogic/pi-mono)
- [Current coding-agent package metadata](https://registry.npmjs.org/@earendil-works%2fpi-coding-agent/latest)
- [Current agent-core package metadata](https://registry.npmjs.org/@earendil-works%2fpi-agent-core/latest)
- [Current AI package metadata](https://registry.npmjs.org/@earendil-works%2fpi-ai/latest)
- [Historical coding-agent package metadata](https://registry.npmjs.org/@mariozechner%2fpi-coding-agent/latest)
- [Historical agent-core package metadata](https://registry.npmjs.org/@mariozechner%2fpi-agent-core/latest)
- [Historical AI package metadata](https://registry.npmjs.org/@mariozechner%2fpi-ai/latest)

### Public API stability

The packages expose typed root APIs and have documentation for embedding, but they are still on a `0.x` version line. That is a practical API, not a stable 1.x contract.

The changelogs show the risk directly:

- `pi-agent-core` has had breaking state and API changes in recent minor releases.
- `pi-coding-agent` has had repeated SDK and resource-loading migrations.
- `pi-ai/compat` is described as temporary and planned for removal.

The right integration rules are therefore:

1. Pin exact package versions rather than using a broad range.
2. Import only documented package-root exports.
3. Keep Pi-specific types out of the application's public API.
4. Add contract tests for event translation, tool invocation, steering, aborts, and model streaming.
5. Treat upgrades as deliberate migrations, not routine dependency updates.

Sources:

- [`pi-agent-core` README at v0.84.2](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/agent/README.md)
- [`pi-agent-core` changelog](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/CHANGELOG.md)
- [`pi-coding-agent` changelog](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/CHANGELOG.md)
- [`pi-ai` changelog](https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/CHANGELOG.md)
- [Pi releases](https://github.com/earendil-works/pi/releases)

### Agent core is separate from the terminal UI

`pi-agent-core` is the clearest reuse point for this POC. Its documented exports include `Agent`, `agentLoop`, `AgentTool`, lifecycle events, streaming callbacks, steering/follow-up queues, and tool hooks. Its package dependencies do not include `pi-tui`.

The agent can publish events through `Agent.subscribe()`. The documented event family includes:

- `agent_start` and `agent_end`.
- `turn_start` and `turn_end`.
- `message_start`, `message_update`, and `message_end`.
- `tool_execution_start`, `tool_execution_update`, and `tool_execution_end`.

That is enough to feed both a line-oriented terminal client and a browser client, provided the host converts it to its own event schema.

`pi-coding-agent` is different. It depends on `pi-tui` and documents interactive terminal, print, JSON, RPC, and SDK modes. Its supported UI is terminal-oriented. The `pi-tui` documentation covers terminal Markdown and terminal display features, but it is not a browser charting, image, or LaTeX renderer.

The separation is a strong argument against adopting the entire CLI. Reusing `pi-coding-agent` wholesale would bring in a terminal-first application layer while the requested rich UI still had to be built separately.

Sources:

- [`pi-agent-core` README](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/agent/README.md)
- [`pi-agent-core` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/agent/package.json)
- [`pi-coding-agent` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/package.json)
- [`pi-coding-agent` README](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/README.md)
- [`pi-tui` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/tui/README.md)

### Browser embedding and transport

Pi documents three useful integration paths:

- The coding-agent SDK provides `createAgentSession()` and direct access to `AgentSession`, `Agent`, state, tools, and events.
- RPC mode provides a process-isolated, language-agnostic protocol for clients that communicate with a Pi process.
- `@earendil-works/pi-client` is transport-neutral and does not depend on Node-specific imports. An application could supply a browser transport such as WebSocket.

`@earendil-works/pi-server` is explicitly experimental. It does not provide a complete standalone service or CLI. The application must supply `PiServerService` and integrate transport and authentication. That makes it a useful reference for a host-owned server boundary, not a reason to outsource the browser backend to Pi.

Inference: Pi supplies a workable agent protocol and runtime for a browser application, but it does not supply the requested browser UI. The POC still owns the HTTP/WebSocket or SSE endpoint, authentication or local-client policy, browser state, Markdown rendering, charting, and LaTeX rendering.

Sources:

- [SDK documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/sdk.md)
- [RPC documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/rpc.md)
- [`pi-client` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/client/README.md)
- [`pi-server` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/server/README.md)
- [Pi protocol README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/protocol/README.md)

### Skills and extensions

Pi has stronger skills support than a minimal custom agent would need to build first:

- Skills use the Agent Skills convention with `SKILL.md` files.
- Discovery covers global, project, `.pi`, `.agents`, package, settings, and explicit CLI locations.
- `DefaultResourceLoader` and `skillsOverride` support programmatic use.
- Extensions can register tools, commands, events, providers, UI dialogs, custom renderers, and permission gates.
- Pi packages can bundle extensions, skills, prompts, and themes.

This is good reuse material, especially if the POC wants a familiar skill format. It is not a security system. Skills can contain executable helper code or instruct the model to execute commands. Extensions and package code run with the full permissions of the Pi process. Project trust controls whether project resources load; it does not sandbox the code or tools that do load.

The host should define resource trust and precedence explicitly. A project-local skill should not silently grant filesystem or shell permissions, and an extension should not be loaded from an untrusted workspace merely because discovery found it.

Sources:

- [Skills documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/skills.md)
- [Extensions documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/extensions.md)
- [Package resources documentation](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/packages.md)
- [Security documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/security.md)

### MCP is intentionally outside Pi

The coding-agent README states "No MCP" as part of Pi's design philosophy. The current package inventory does not provide a first-party MCP client abstraction or MCP dependency for the coding-agent runtime.

That is not a blocker, but it changes the reuse decision. The POC must either:

- implement MCP in the host with the official MCP SDK, or
- add and maintain a Pi extension/package that handles MCP.

The host should own MCP server configuration, process launch, transport selection, consent, tool discovery, and policy mapping. It should support a local stdio server first, then a Streamable HTTP server. MCP Roots, when present, are hints exchanged by the protocol, not a substitute for the host's workspace authorization.

Sources:

- [`pi-coding-agent` README](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/README.md)
- [Current Pi package inventory](https://raw.githubusercontent.com/earendil-works/pi/main/README.md)
- [MCP specification](https://modelcontextprotocol.io/specification/latest)
- [MCP transports](https://modelcontextprotocol.io/specification/latest/basic/transports)
- [MCP client roots](https://modelcontextprotocol.io/specification/latest/client/roots)
- [MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

### Steering, cancellation, and approvals

`pi-agent-core` provides useful control primitives:

- `Agent.steer()` adds a steering message while an agent run is active.
- `Agent.followUp()` queues a message for after the current turn.
- Queue behavior can be configured for one-at-a-time or all-at-once handling.
- `beforeToolCall` and `afterToolCall` hooks can inspect tool execution.
- Abort signals support cancellation.

The coding-agent extension API also exposes a `tool_call` event that can block execution. RPC's extension UI protocol supports `select`, `confirm`, `input`, and `editor` interactions. Those pieces can implement a browser approval flow, but they do not define the application's approval policy.

Pi's philosophy explicitly says "No permission popups," and its security documentation says there is no built-in sandbox. The host must decide which operations need approval, present enough context to the user, handle denial and cancellation, and make sure a tool cannot bypass the decision through another path.

Use Pi's hooks and queues as mechanics. Keep approval state, authorization decisions, audit records, and UI presentation in the application.

Sources:

- [`pi-agent-core` README](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/agent/README.md)
- [Extensions documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/extensions.md)
- [RPC documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/rpc.md)
- [Security documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/security.md)

### Provider and model abstraction

`pi-ai` is the strongest part of the ecosystem for this use case. It provides:

- `createModels()` and the `Models` catalog.
- Provider factories and custom `createProvider()` implementations.
- Integrations for OpenAI, Anthropic, Google, Vertex, Bedrock, Mistral, OpenRouter, and other providers.
- OpenAI-compatible endpoints such as Ollama, vLLM, and LM Studio.
- Provider-owned authentication and OAuth support.
- Model catalogs, reasoning levels, usage, and cost accounting.
- Tool schemas and validation.
- Streaming and cross-provider context handoff.
- Lazy provider imports and tree-shaking support.

Reimplementing this layer would create a large amount of integration and compatibility work without helping the POC's distinctive requirements. Reuse it, but map its model and stream types to an internal interface so provider changes do not leak through the application.

Sources:

- [`pi-ai` README at v0.84.2](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/ai/README.md)
- [`pi-ai` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/ai/package.json)

### Filesystem, shell, and workspace containment

The coding-agent package includes built-in `read`, `write`, `edit`, `grep`, `find`, `ls`, and `bash` tools. Tool factories accept a `cwd`, and the implementation allows operations to be replaced or delegated.

The important limitation is that `cwd` is an execution and discovery base, not a configurable containment boundary:

- Path utilities resolve inputs relative to `cwd`, but do not turn `cwd` into an allowlisted root.
- Absolute paths can name locations outside `cwd`.
- `..` traversal, symlinks, junctions, and Windows path forms need explicit handling by the host.
- `bash` runs arbitrary shell commands with the permissions of the Pi process.
- Pi's security documentation says that tools and extensions have the full permissions of that process.

Do not use project trust, `cwd`, or MCP Roots as the POC's security boundary. For a contained POC, use one of these designs:

1. Use `pi-agent-core` and register custom root-aware tools.
2. Use the coding-agent factories but override or delegate every filesystem and shell operation, enforcing canonical path containment and link handling before execution.

The first design is easier to reason about because the application starts with an explicit tool allowlist. Either design needs tests for Windows drive paths, UNC paths, case behavior, junctions, symlinks, and paths that become unsafe after resolution.

Sources:

- [Path utilities](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/path-utils.ts)
- [Bash tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/bash.ts)
- [Read tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/read.ts)
- [Write tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/write.ts)
- [Edit tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/edit.ts)
- [Tool factories](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/index.ts)
- [Security documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/security.md)
- [Containerization documentation](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/containerization.md)

### Embeddability and process boundaries

Pi can be embedded, but the useful unit is the runtime and protocol, not the full terminal application.

The SDK path is appropriate when the host and agent share a process. RPC is appropriate when the host wants process isolation or a language-agnostic client. The client and protocol packages can help define a browser-facing transport without importing the terminal UI.

The word "isolation" needs care. Pi's RPC process boundary is a process boundary, not automatically a security sandbox. If the child process retains the same user permissions and unrestricted shell access, moving it to another process does not enforce workspace containment. The host still needs OS-level sandboxing or strict host-owned tools if the threat model requires it.

Sources:

- [SDK documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/sdk.md)
- [RPC documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/rpc.md)
- [`pi-client` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/client/README.md)
- [Pi protocol README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/protocol/README.md)
- [`pi-server` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/server/README.md)

### Bun and Node packaging

The published packages are ESM packages. Current package metadata targets modern Node, with the current coding-agent package requiring Node `>=22.19.0` where declared. Direct Node embedding is documented and supported. Provider and OAuth integrations may have provider-specific Node or browser caveats, so the exact provider set still needs a build test.

Pi itself builds standalone binaries with Bun's `build --compile`. The upstream build script lists macOS x64/arm64, Linux x64/arm64, and Windows x64/arm64 targets. The release archives contain more than the executable, including themes and assets, export templates, Photon WASM, and native clipboard/input sidecars.

That makes standalone distribution viable, but it does not mean every downstream application becomes one file automatically. The POC must test:

- asset loading after compilation;
- subprocess and stdio MCP behavior;
- model-provider imports and authentication;
- target-specific native dependencies;
- browser startup and local server binding;
- the difference between source-run and compiled behavior.

A compiled executable also cannot contain the user's browser. A browser-based rich UI remains an external runtime unless a later desktop shell supplies a WebView.

Sources:

- [`pi-coding-agent` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/package.json)
- [`pi-agent-core` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/agent/package.json)
- [`pi-ai` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/ai/package.json)
- [Pi binary builder](https://raw.githubusercontent.com/earendil-works/pi/main/scripts/build-binaries.sh)
- [Pi build and release instructions](https://raw.githubusercontent.com/earendil-works/pi/main/README.md)
- [Bun standalone executable documentation](https://bun.com/docs/bundler/executable)

### License

The Pi repository is MIT-licensed, and the checked package metadata declares MIT for the relevant packages. Redistribution is allowed if the copyright and license notices are retained. The POC should still audit transitive dependencies, native sidecars, and bundled WASM before publishing a standalone artifact.

Sources:

- [Pi license](https://raw.githubusercontent.com/earendil-works/pi/main/LICENSE)
- [Current coding-agent package metadata](https://registry.npmjs.org/@earendil-works%2fpi-coding-agent/latest)
- [Current agent-core package metadata](https://registry.npmjs.org/@earendil-works%2fpi-agent-core/latest)
- [Current AI package metadata](https://registry.npmjs.org/@earendil-works%2fpi-ai/latest)

## Reuse versus custom implementation

| Choice | What it buys | What remains ours | Assessment |
|---|---|---|---|
| Adopt `pi-coding-agent` as-is | Fast terminal agent, skills, sessions, built-in tools, and existing CLI modes | Browser UI, MCP, workspace policy, approvals, and a stable application API | Reject for this POC. It is terminal-first and too permissive as a security boundary. |
| Use `pi-agent-core` plus `pi-ai` | Agent loop, events, steering, tools, provider abstraction, streaming, auth, and model catalogs | Browser UI, MCP, skills policy, filesystem/shell policy, approvals, server transport, packaging | **Recommended.** It reuses the expensive generic parts without inheriting the full CLI. |
| Add selected `pi-coding-agent` pieces | Skill/resource discovery, session behavior, and possibly useful tool factories | Trust policy, containment, browser, MCP, approvals, internal interfaces | Good supplement, but keep imports narrow and documented. |
| Build the entire agent custom | Complete control over state, tools, security, events, UI protocol, and release shape | All provider integrations, auth, streaming, tool schemas, model catalogs, and agent-loop edge cases | Only choose this if Pi's security model or 0.x API churn fails the POC gates. |

The recommended boundary is an application-owned interface around Pi. The interface should expose only the concepts the POC needs: run/turn lifecycle, assistant deltas, tool requests and progress, approval requests, steering, cancellation, model selection, and session state. Pi-specific event and provider types should stop at the adapter.

## Key risks

1. **Pre-1.0 API churn.** Package names recently changed, versions are still `0.x`, and changelogs contain breaking migrations. Exact pins and contract tests are required.
2. **Containment is not built in.** `cwd` and project trust do not prevent access to absolute paths, links, parent directories, or arbitrary shell commands.
3. **Approvals are host work.** Pi supplies hooks and interactive primitives, but no general permission policy or sandbox.
4. **MCP is host work.** There is no built-in MCP implementation. The POC must own transport, server configuration, consent, and policy integration.
5. **Skills and extensions execute code.** Loading project-local resources can load instructions or code with the process's permissions. Trust must be explicit.
6. **The browser layer is not supplied.** Pi can feed a browser client, but the POC must build rendering, transport, reconnection, and client state.
7. **Experimental server package.** `pi-server` is not a ready-made authenticated standalone service.
8. **Bun distribution has edges.** Compiled targets need per-platform builds and may require assets or native sidecars. Source execution passing is not enough.
9. **Provider and auth differences.** A provider may work under Node or source-run Bun and fail in a compiled target, or need a provider-specific credential flow.
10. **Process boundaries can mislead.** RPC can separate failures and clients, but it is not a sandbox unless the host adds OS-level restrictions.

## POC validation plan

The POC should treat the following as acceptance gates, not follow-up cleanup.

### 1. Lock and exercise the integration boundary

- Pin the current `@earendil-works` packages to exact versions.
- Import only documented root exports.
- Add a small contract test for the internal adapter:
  - model request and streamed assistant deltas;
  - lifecycle and tool events;
  - steering and follow-up messages;
  - approval, denial, abort, and error transitions.
- Run type checking and the contract tests against the pinned version.
- Record the upgrade procedure and repeat the tests after one deliberate package upgrade.

Pass condition: the application-facing types do not expose Pi-specific internals, and a Pi minor-version change either passes the contract suite or produces a short, actionable migration.

### 2. Prove terminal launch and workspace policy

Run the agent from a folder unrelated to the selected workspace. Test both the default current-directory behavior and an explicit workspace override.

Attempt access using:

- normal relative paths;
- `..` traversal;
- absolute POSIX-like and Windows drive paths;
- UNC and device-like Windows path forms where applicable;
- a symlink or junction inside the workspace pointing outside it;
- a workspace path that itself is a symlink or junction;
- case variations and normalized/non-normalized separators;
- paths that change during resolution.

Pass condition: every filesystem operation either remains within the canonical configured root or is rejected before execution. The tests must cover read, write, edit, search, listing, and any MCP filesystem tool.

### 3. Prove shell authorization

Exercise allowed, denied, and cancelled shell commands. Test commands that use relative paths, absolute paths, `..`, symlinks or junctions, child processes, environment variables, and shell redirection. Verify that an approval applies to the intended command and does not silently grant a broader shell capability.

Pass condition: the host can show the command, wait for approval, deny it, cancel it, and record the result. A denied shell action cannot be retried through an unapproved built-in or extension path.

### 4. Prove event streaming to both clients

Connect a terminal client and a browser client to the same event model. Validate:

- incremental assistant text;
- tool start, progress, and completion;
- steering during an active run;
- approval requests and responses;
- cancellation and abort;
- model errors and tool errors;
- ordering and session identity after reconnect.

Pass condition: both clients render the same state transitions without making either client the source of truth.

### 5. Prove browser rendering

Render representative assistant output containing Markdown, code blocks, images, a chart payload, and inline and display LaTeX. Include long streaming messages and tool progress. Verify that untrusted model output cannot execute arbitrary browser script or load unexpected local files.

Pass condition: the browser can display the required content, update it while streaming, and show approval and cancellation controls without requiring terminal-specific rendering.

### 6. Prove MCP integration and policy mapping

Implement and test:

- one local MCP server over stdio;
- one MCP server over Streamable HTTP;
- tool discovery and invocation;
- a server that requests user input or consent;
- a server action that attempts to access outside the configured workspace.

Show the configured server command or endpoint before enabling it. Treat advertised roots as informational and apply the host's own path and approval policy.

Pass condition: both transports stream correctly, server failures are visible, sensitive actions require host approval, and MCP tools cannot bypass workspace containment.

### 7. Prove skills and trust behavior

Test a trusted global skill, a trusted project skill, an untrusted project skill, an explicit skill override, and a package-provided skill. Verify discovery precedence and whether a resource can register executable extension code.

Pass condition: skill instructions load according to a documented precedence rule, untrusted project resources do not gain execution or permission authority, and extension loading is an explicit trust decision.

### 8. Prove distribution

Run the POC from source under Node and Bun as supported by the selected dependencies. Compile a standalone Bun artifact and test at least Windows x64, since that is the current development environment. Test additional upstream targets later.

For the compiled artifact, verify:

- launch from an arbitrary folder;
- explicit workspace selection;
- browser server startup and loopback binding;
- Markdown, chart, and LaTeX assets;
- model provider imports and authentication;
- MCP stdio subprocess launch;
- cancellation and shell behavior;
- absence or intentional packaging of required sidecars/assets.

Pass condition: the artifact behaves like the source-run POC for the acceptance cases, and the release process documents target-specific output and any files shipped beside the executable.

### Decision gate after the POC

Continue with Pi if `pi-agent-core` and `pi-ai` meet the event, provider, and cancellation tests, while custom host tools meet the containment and approval tests. If the POC requires patching Pi internals, replacing most of the tool layer, or depending on unstable session internals, retain `pi-ai` only or move to a custom agent core. The browser and host policy should remain application-owned in either case.

## Primary sources

### Pi identity and packages

- [Current repository](https://github.com/earendil-works/pi)
- [Historical repository](https://github.com/badlogic/pi-mono)
- [Current coding-agent package metadata](https://registry.npmjs.org/@earendil-works%2fpi-coding-agent/latest)
- [Current agent-core package metadata](https://registry.npmjs.org/@earendil-works%2fpi-agent-core/latest)
- [Current AI package metadata](https://registry.npmjs.org/@earendil-works%2fpi-ai/latest)
- [Historical coding-agent package metadata](https://registry.npmjs.org/@mariozechner%2fpi-coding-agent/latest)
- [Historical agent-core package metadata](https://registry.npmjs.org/@mariozechner%2fpi-agent-core/latest)
- [Historical AI package metadata](https://registry.npmjs.org/@mariozechner%2fpi-ai/latest)
- [Pi license](https://raw.githubusercontent.com/earendil-works/pi/main/LICENSE)
- [Pi releases](https://github.com/earendil-works/pi/releases)

### Agent core and AI

- [`pi-agent-core` README](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/agent/README.md)
- [`pi-agent-core` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/agent/package.json)
- [`pi-agent-core` changelog](https://raw.githubusercontent.com/earendil-works/pi/main/packages/agent/CHANGELOG.md)
- [`pi-ai` README](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/ai/README.md)
- [`pi-ai` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/ai/package.json)
- [`pi-ai` changelog](https://raw.githubusercontent.com/earendil-works/pi/main/packages/ai/CHANGELOG.md)

### Coding-agent runtime and integration

- [`pi-coding-agent` README](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/README.md)
- [`pi-coding-agent` package metadata](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/package.json)
- [`pi-coding-agent` changelog](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/CHANGELOG.md)
- [SDK documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/sdk.md)
- [RPC documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/rpc.md)
- [Skills documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/skills.md)
- [Extensions documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/extensions.md)
- [Package resources documentation](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/packages.md)
- [Security documentation](https://raw.githubusercontent.com/earendil-works/pi/v0.84.2/packages/coding-agent/docs/security.md)
- [Containerization documentation](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/containerization.md)
- [`pi-tui` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/tui/README.md)
- [`pi-client` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/client/README.md)
- [`pi-server` README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/server/README.md)
- [Pi protocol README](https://raw.githubusercontent.com/earendil-works/pi/main/packages/protocol/README.md)
- [Path utilities](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/path-utils.ts)
- [Bash tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/bash.ts)
- [Read tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/read.ts)
- [Write tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/write.ts)
- [Edit tool](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/edit.ts)
- [Tool factories](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/core/tools/index.ts)

### MCP and packaging

- [MCP specification](https://modelcontextprotocol.io/specification/latest)
- [MCP transports](https://modelcontextprotocol.io/specification/latest/basic/transports)
- [MCP client roots](https://modelcontextprotocol.io/specification/latest/client/roots)
- [MCP security best practices](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices)
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Pi binary builder](https://raw.githubusercontent.com/earendil-works/pi/main/scripts/build-binaries.sh)
- [Bun standalone executable documentation](https://bun.com/docs/bundler/executable)
