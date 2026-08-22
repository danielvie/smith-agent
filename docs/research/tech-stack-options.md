# Technology-stack options for a local assistant POC

**Research date:** 2026-08-22

## Scope

This compares stacks for a local assistant agent with:

1. A terminal mode that can be invoked from any folder while keeping a configurable, contained project workspace.
2. A richer UI for Markdown, charts, images, and LaTeX.
3. Skills, MCP, and user steering/approval.
4. A credible path to distribution as an easy single executable.

The sources below are official documentation, specifications, or upstream repositories only.

## Executive recommendation

**Use TypeScript on Bun for the first POC.** Run the agent from the current working directory by default, accept an explicit workspace path, serve a small browser UI from a local Bun HTTP server, and use the official MCP TypeScript SDK. Validate `bun build --compile` early rather than treating packaging as a final phase.

This is the smallest path that covers both requested interaction modes without building two UI systems:

- The terminal interface can remain a small line-oriented CLI.
- The browser handles Markdown, images, charts, and LaTeX through the existing web ecosystem.
- The official MCP TypeScript SDK supports Node.js, Bun, and Deno, including client and server functionality.
- Bun can compile the server, bundled packages, and assets into a target-specific standalone executable.

The tradeoff is important: the executable can contain the agent and web application, but **it cannot contain the user's browser**. The rich mode therefore still requires a browser, and releases must be built for each OS/architecture. If “single executable” means a native binary with no browser or WebView dependency, choose **Rust + ratatui + Axum** instead, accepting substantially more POC work and keeping rich content in an external browser or adding a later desktop shell.

Tauri v2 is a good later desktop shell, but not the smallest first experiment. It adds Rust, WebView provisioning, desktop packaging, and a CLI/GUI process boundary before the agent and UI behavior have been validated.

## Evaluation criteria

### Terminal invocation and workspace containment

The process should be able to start in an arbitrary current working directory. The default workspace should be the process working directory, with an explicit override such as `--workspace <path>`.

The agent, not MCP Roots, must enforce containment:

- Canonicalize the selected workspace before use.
- Resolve and validate every built-in filesystem operation against that directory.
- Keep user/global configuration separate from project state.
- Treat configured MCP servers as privileged subprocesses or local services and require explicit consent before enabling risky tools.

MCP Roots are workspace guidance, not a security boundary. The current Roots documentation describes them as informational, and the latest page marks the capability deprecated. The host must enforce its own filesystem policy: [MCP Roots](https://modelcontextprotocol.io/specification/latest/client/roots).

### Rich rendering

A terminal UI can show text, tables, progress, and simplified charts, but it is the wrong primary renderer for arbitrary Markdown, images, and TeX. A local browser UI gives those formats their native rendering environment:

- [`react-markdown`](https://github.com/remarkjs/react-markdown) renders Markdown and documents integration with GitHub-Flavored Markdown, images, and math through `remark-math` and `rehype-katex`.
- [KaTeX](https://github.com/KaTeX/KaTeX) renders TeX/LaTeX in the browser and can be bundled with the frontend.
- [Apache ECharts](https://github.com/apache/echarts) supplies browser charts and visualization.

The recommended POC should therefore use one simple terminal client and one local browser client, rather than trying to make a TUI reproduce the browser renderer.

### MCP, skills, and steering

The [MCP specification](https://modelcontextprotocol.io/specification/latest) defines a host/client/server model over JSON-RPC. The standard transports relevant to a local agent are:

- **stdio:** the client launches a local server subprocess and exchanges messages over standard input/output.
- **Streamable HTTP:** the client connects to an HTTP endpoint, with streaming responses where needed.

MCP servers expose tools, resources, and prompts. [Prompts](https://modelcontextprotocol.io/specification/latest/server/prompts) are user-controlled reusable templates/workflows and can provide a useful bridge for selected skills. [Elicitation](https://modelcontextprotocol.io/specification/latest/client/elicitation) lets a server request user input through form or URL flows, which is useful for consent and interactive steering.

“Skills” and “steering” should remain host-owned concepts in the first POC:

- Load skill definitions from an application/global location and an optional workspace location.
- Keep a clear precedence rule between global and project-local skills.
- Represent steering as shared agent events—message, approval/denial, cancellation, and tool confirmation—consumed by both CLI and browser UI.
- Optionally expose selected skills as MCP prompts; do not make the POC depend on an unverified MCP skills extension.

The [MCP security best-practices documentation](https://modelcontextprotocol.io/specification/latest/basic/security_best_practices) is especially relevant for local servers: a server launched locally executes with client privileges. The host should show what it is launching, ask for consent, and apply its own workspace and tool policies.

The [official MCP registry](https://modelcontextprotocol.io/registry/about.md) is currently preview status. The [official reference servers](https://github.com/modelcontextprotocol/servers) are useful for interoperability testing, but their README describes them as educational examples rather than production-ready servers. A first POC should use explicit local configuration for server commands instead of making registry discovery a dependency.

## Comparison

| Option | Terminal and workspace | Rich UI | MCP and integration | Packaging and cross-platform | POC assessment |
|---|---|---|---|---|---|
| **Rust + ratatui + Axum** | Excellent control; native CLI; `std::env::current_dir` plus explicit path policy | Axum can serve an embedded browser frontend; ratatui itself is a degraded renderer | Official Tokio-based [`rmcp`](https://github.com/modelcontextprotocol/rust-sdk); stdio and Streamable HTTP client support | Strong native binaries and many Rust targets; browser still external | Best systems/distribution foundation; more work for the smallest POC |
| **Tauri v2** | CLI possible, but GUI/CLI lifecycle and workspace semantics need deliberate design | Excellent HTML/CSS/JS UI in the OS WebView | Rust core or sidecar can host MCP; CLI integration is available through a plugin | Platform-specific bundles/installers; WebView runtime is supplied by the OS, not included in the executable | Good desktop product shell; too much infrastructure for the first behavior test |
| **TypeScript + Bun** | Simple process-CWD behavior and explicit `--workspace`; easy shared code between CLI and web server | Excellent browser ecosystem through a local HTTP server | Official TypeScript SDK runs on Bun and supports client/server, stdio, Streamable HTTP, prompts, tools, resources, and OAuth helpers | `bun build --compile` produces a standalone target-specific executable containing runtime, bundled code, packages, and assets | **Smallest recommended POC** |
| **TypeScript + Node.js** | Same application model and ecosystem as Bun | Excellent browser ecosystem | Same official TypeScript SDK; Node is a first-class supported runtime | Node SEA is official but documented as “Active development”; build/injection rules make packaging more involved | Strong fallback where Node compatibility is more important than packaging simplicity |
| **Python + Textual** | Very fast terminal prototype; workspace/process handling is straightforward | Textual has terminal and web modes, Markdown, and Sparkline widgets; richer media/math needs more integration | Official Python SDK has full client/server support | PyInstaller one-file builds are platform/Python-version specific, extract to a temporary directory, and are not cross-compilers | Good if the agent is already Python; weaker fit for this distribution target |
| **Go + Bubble Tea + `net/http`** | Excellent native CLI and simple explicit workspace policy | Serve embedded browser assets with standard `embed` and `net/http`; browser remains external | Official Go SDK; includes command/stdio transport patterns | `go build` and `embed` give a clean native executable story; one build per target | Strong native-binary alternative, but less direct web/MCP UI integration than TypeScript |

## Detailed option analysis

### Rust core + ratatui + local Axum web UI

[Ratatui](https://ratatui.rs/) is purpose-built for terminal interfaces and its upstream repository documents widgets and layouts for dashboards, tables, charts, and sparklines. It is a strong choice when the terminal is a primary product surface.

[Axum](https://github.com/tokio-rs/axum) is a lightweight HTTP routing framework built around Tokio, Hyper, and Tower. A Rust process can run the local server, serve a compiled browser frontend, and keep the agent core in the same executable. Rust's standard library provides compile-time file inclusion through [`include_bytes!`](https://doc.rust-lang.org/std/macro.include_bytes.html), so a frontend can be packaged into the executable without requiring a separate asset directory.

[Rust platform support](https://doc.rust-lang.org/rustc/platform-support.html) and [`cargo build`](https://doc.rust-lang.org/cargo/commands/cargo-build.html) provide a strong native release story. The official [Rust MCP SDK](https://github.com/modelcontextprotocol/rust-sdk), `rmcp`, is Tokio-based and supports client connections to child-process stdio servers and Streamable HTTP, along with tools, resources, prompts, elicitation, and roots.

The main cost is implementation effort. A first POC needs a Rust CLI, async agent plumbing, MCP integration, asset serving, browser protocol, and possibly a separate frontend toolchain. Ratatui does not remove the need for a browser if the rich UI must display images and LaTeX. Choose this stack first only when native executable control, resource use, or a terminal-first product outweighs iteration speed.

### Tauri v2

[Tauri's architecture](https://v2.tauri.app/concept/architecture/) combines a Rust application core with an HTML/CSS/JavaScript frontend rendered by the operating system's WebView. [Tauri's process model](https://v2.tauri.app/concept/process-model/) makes the frontend and Rust core separate contexts, which is useful for a desktop application but introduces another boundary for a small agent POC.

Tauri manages frontend resources as part of the application ([resources](https://v2.tauri.app/develop/resources/)) and can bundle a non-Rust executable as a [sidecar](https://v2.tauri.app/develop/sidecar/). It also has a [CLI plugin](https://v2.tauri.app/plugin/cli/) for command-line integration. Those capabilities make it viable for a later desktop application that shares the agent core with a CLI.

The important packaging limitation is that Tauri uses system WebViews rather than shipping a browser runtime in the executable. The [prerequisites](https://v2.tauri.app/start/prerequisites/) identify the platform dependencies: Microsoft Edge WebView2 on Windows, WKWebView on macOS, and WebKitGTK on Linux. The [distribution documentation](https://v2.tauri.app/distribute/) focuses on platform-specific bundles and installers. Tauri can produce a small desktop distribution, but that is not the same as one universal portable executable with no runtime prerequisites.

For this POC, Tauri would add desktop-window and installer concerns before the core agent contract, MCP behavior, skill loading, and steering model are known to be right. Start with a local browser. Revisit Tauri when a managed desktop window, native menus, notifications, or an installer is an actual requirement.

### TypeScript + Bun

The official [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) is the most direct match for a browser-oriented POC. Its README documents support for Node.js, Bun, and Deno and provides client/server APIs for stdio and Streamable HTTP, plus prompts, tools, resources, and related protocol features.

A Bun program can be both the command-line entry point and the local HTTP server. The frontend can be bundled as normal web assets and served from loopback. This gives the POC one language, one runtime, and one event/data model across the terminal and browser paths.

Bun's [`build --compile` documentation](https://bun.com/docs/bundler/executable) documents standalone executables containing the Bun runtime, bundled application code, packages, and assets. The [Bun bundler documentation](https://bun.com/docs/cli/build) documents target selection for Windows, macOS, and Linux, including x64/ARM64 and relevant Linux targets. Bun also documents full-stack executables containing server code and imported frontend assets.

The fit is not risk-free. A source-run application can work while a compiled executable exposes an unsupported dependency, native addon, dynamic file lookup, or MCP transport assumption. Make compilation a first-week acceptance test. Releases will still be target-specific, and the rich mode needs a browser; Bun does not remove either constraint.

### TypeScript + Node.js

Node provides the same strong browser and JavaScript ecosystem, and the official MCP TypeScript SDK supports it. It is the conservative choice when compatibility with existing Node packages, operational tooling, or team experience is more valuable than the simplest standalone build.

Node's [single-executable application documentation](https://nodejs.org/api/single-executable-applications.html) describes the official SEA workflow, including `node --build-sea`. The documentation currently labels SEA as **Active development**. An injected application must be bundled appropriately: normal filesystem module resolution is not available in the same way as a regular Node project, and embedded assets/modules need explicit handling.

Node is therefore a credible POC runtime and a good fallback from Bun, but its single-executable path has more packaging ceremony and more constraints to test. It does not improve the browser requirement over Bun.

### Python + Textual

[Textual](https://textual.textualize.io/) supports terminal applications and a web-serving mode. Its [Markdown widget](https://textual.textualize.io/widgets/markdown/) and [Sparkline widget](https://textual.textualize.io/widgets/sparkline/) make it attractive for rapidly exploring an agent's terminal interaction model. [Rich](https://github.com/Textualize/rich) supplies terminal Markdown, tables, progress displays, syntax highlighting, and other terminal formatting.

The [official Python MCP SDK](https://github.com/modelcontextprotocol/python-sdk) supports client and server implementations, including stdio and HTTP-based transports. Python is consequently a practical choice when the agent logic or model tooling is already Python.

For this particular UI target, Textual is less direct than a dedicated browser frontend. The cited Textual components cover terminal/web application widgets, Markdown, and sparklines; browser-native charting, image handling, and LaTeX would require additional integration or custom widgets. That is an integration-cost inference, not a claim that Textual cannot be extended.

[PyInstaller's operating-mode documentation](https://pyinstaller.org/en/stable/operating-mode.html) documents one-file bundles, but also documents that one-file applications unpack to a temporary directory at runtime, that builds are specific to the operating system and Python version, and that PyInstaller is not a cross-compiler. Linux portability also depends on the system's libc baseline. Python/Textual is a good throwaway UI experiment, but not the best fit for an easy, predictable cross-platform executable.

### Go

Go offers a clean native-binary alternative. The official [compile and install tutorial](https://go.dev/doc/tutorial/compile-install) documents building an executable. The standard library's [`embed` package](https://pkg.go.dev/embed) can include static frontend files in the binary, after which `net/http` can serve them locally.

[Bubble Tea](https://github.com/charmbracelet/bubbletea) is a mature stateful terminal UI framework from Charm, with an ecosystem for terminal tables, progress, and related widgets. It is a credible ratatui alternative when the terminal is important.

The [official Go MCP SDK](https://github.com/modelcontextprotocol/go-sdk) provides client/server support and documents command/stdio transport patterns. Go therefore has a straightforward process model for launching local MCP servers and a strong single-binary story.

The drawback is fit rather than capability: a rich browser frontend still needs to be built separately, and the TypeScript SDK plus web ecosystem is more direct for a browser-first POC. Choose Go when native distribution and simple operations are more important than sharing language and libraries with the frontend.

## Recommended smallest POC architecture

### Runtime and entry point

- TypeScript source executed by Bun during development.
- One CLI entry point, with the default workspace set to the process current working directory.
- Optional `--workspace <path>` override.
- Separate global/user configuration from workspace configuration.
- Canonicalize the selected workspace and enforce the boundary in every built-in filesystem operation.
- Treat the current working directory as a launch location, not as an implicit permission to access its parent or sibling directories.

Do not add a TUI framework for the first POC. A line-oriented terminal mode is enough to validate workspace behavior, agent turns, tool approvals, and steering. Add ratatui or Bubble Tea only if terminal layout—not agent behavior—is the question being tested.

### Rich mode

- Start a loopback HTTP server from the same Bun process.
- Serve a small browser frontend and open it in the user's default browser.
- Stream agent events over SSE initially; move to WebSocket only if bidirectional streaming is actually needed.
- Render assistant Markdown in the browser, with KaTeX for math and ECharts for charts.
- Keep the frontend and CLI on the same event model so neither becomes the source of truth for agent state.

This intentionally uses a browser dependency instead of a WebView dependency. A normal browser is already installed on most desktop systems; the POC should state that requirement rather than hiding it. Loopback binding and explicit approval are still needed because a local HTTP endpoint is a security boundary.

### MCP

- Use the official TypeScript SDK as the MCP client.
- Implement stdio first: the host launches configured local MCP server commands.
- Add Streamable HTTP after the local process flow works.
- Keep server configuration explicit in the first POC; do not depend on the preview registry.
- Show the server command and requested tool action before granting sensitive access.
- Apply workspace containment in the host even when a server advertises roots.

The MCP server/client boundary should be isolated behind a small internal interface. That makes a later Rust or Go core possible without making the first POC carry a second runtime.

### Skills and steering

- Store skills as simple app-owned Markdown or JSON documents in global and workspace locations.
- Resolve precedence explicitly; workspace-local skills should not silently override security policy.
- Treat a skill as instructions and metadata, not as an automatic permission grant.
- Use a shared event model for user messages, steering messages, approvals, denials, cancellation, and tool results.
- Use MCP prompts for selected reusable workflows and MCP elicitation where a server needs structured user input or consent.

The host owns policy and steering. MCP supplies interoperability mechanisms; it does not replace the application's workspace authorization or user-consent model.

### Distribution

Develop and test the source-run Bun application first, but compile it immediately as a release acceptance test:

```text
bun build --compile <entrypoint> --outfile <target-specific-name>
```

The exact entrypoint, asset imports, and target flags are implementation decisions and are intentionally not created by this research task. The release process should build separately for each supported OS/architecture and test at least:

- terminal launch from a non-project folder with `--workspace`;
- default workspace from the current directory;
- compiled binary starting the browser UI;
- compiled binary launching an MCP stdio server;
- asset loading for Markdown/math/chart rendering;
- denied filesystem access outside the workspace.

## Decision and migration path

### Pick Bun now when

- The first goal is validating agent behavior, MCP integration, skills, steering, and the two interaction modes.
- A browser-based rich UI is acceptable.
- A target-specific standalone executable is sufficient.
- Fast iteration and TypeScript/web library reuse matter.

### Pick Rust now when

- A native single executable is the dominant requirement from day one.
- Terminal UI quality and low-level process/resource control are central.
- The team accepts a larger initial implementation and a separate browser frontend.

### Defer Tauri until

- The browser POC has validated the UI and event model.
- A desktop window, native integration, installer, or WebView-specific capability is worth the platform packaging cost.
- The CLI and GUI ownership model is clear enough to avoid duplicating agent state.

A useful migration boundary is the protocol rather than the runtime: keep workspace policy, skill representation, MCP configuration, agent events, and steering/approval messages independent of the CLI and browser transport. A later Rust/Go core or Tauri shell can then replace one process boundary without redesigning those concepts.

## Risks and open questions

1. **Browser versus executable definition.** A Bun compiled executable can package the application and assets, but not a browser. Tauri also relies on an OS WebView. Decide whether “single executable” permits an external browser.
2. **Bun compilation compatibility.** Confirm the official MCP SDK, subprocess handling, HTTP streaming, asset imports, and any model-provider SDKs in a compiled binary, not only under `bun run`.
3. **MCP trust.** Local MCP servers execute with the host user's privileges. Require consent, display commands, and enforce workspace policy independently of advertised roots.
4. **Skills format.** There is no need to invent a broad skills protocol for the POC. Start with a narrow app-owned format and only add MCP prompt exposure where it has a concrete use.
5. **Loopback security.** Bind locally, avoid exposing the UI on all interfaces by default, and protect state-changing endpoints against unintended local callers.
6. **Target coverage.** Bun, Rust, Go, Node SEA, Tauri, and PyInstaller all require platform-specific validation; none gives one universal binary for every OS and CPU architecture.
7. **TUI scope.** Rich Markdown/math/image rendering should degrade to text in terminal mode. Do not make terminal rendering a second browser implementation unless it becomes a separate product requirement.

## Primary sources

### MCP

- Specification overview: <https://modelcontextprotocol.io/specification/latest>
- Transports: <https://modelcontextprotocol.io/specification/latest/basic/transports>
- Security best practices: <https://modelcontextprotocol.io/specification/latest/basic/security_best_practices>
- Server prompts: <https://modelcontextprotocol.io/specification/latest/server/prompts>
- Client roots: <https://modelcontextprotocol.io/specification/latest/client/roots>
- Client elicitation: <https://modelcontextprotocol.io/specification/latest/client/elicitation>
- Documentation index: <https://modelcontextprotocol.io/llms.txt>
- TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
- Python SDK: <https://github.com/modelcontextprotocol/python-sdk>
- Rust SDK: <https://github.com/modelcontextprotocol/rust-sdk>
- Go SDK: <https://github.com/modelcontextprotocol/go-sdk>
- Registry status: <https://modelcontextprotocol.io/registry/about.md>
- Reference servers: <https://github.com/modelcontextprotocol/servers>

### Browser rendering

- React Markdown: <https://github.com/remarkjs/react-markdown>
- KaTeX: <https://github.com/KaTeX/KaTeX>
- Apache ECharts: <https://github.com/apache/echarts>

### Rust and Tauri

- Ratatui: <https://ratatui.rs/> and <https://github.com/ratatui/ratatui>
- Axum: <https://github.com/tokio-rs/axum>
- Rust platform support: <https://doc.rust-lang.org/rustc/platform-support.html>
- Cargo build: <https://doc.rust-lang.org/cargo/commands/cargo-build.html>
- Rust `include_bytes!`: <https://doc.rust-lang.org/std/macro.include_bytes.html>
- Tauri architecture: <https://v2.tauri.app/concept/architecture/>
- Tauri process model: <https://v2.tauri.app/concept/process-model/>
- Tauri prerequisites: <https://v2.tauri.app/start/prerequisites/>
- Tauri distribution: <https://v2.tauri.app/distribute/>
- Tauri resources: <https://v2.tauri.app/develop/resources/>
- Tauri sidecars: <https://v2.tauri.app/develop/sidecar/>
- Tauri CLI plugin: <https://v2.tauri.app/plugin/cli/>

### Bun and Node.js

- Bun standalone executables: <https://bun.com/docs/bundler/executable>
- Bun build: <https://bun.com/docs/cli/build>
- Node single-executable applications: <https://nodejs.org/api/single-executable-applications.html>

### Python and Go

- Textual documentation: <https://textual.textualize.io/>
- Textual Markdown: <https://textual.textualize.io/widgets/markdown/>
- Textual Sparkline: <https://textual.textualize.io/widgets/sparkline/>
- Rich: <https://github.com/Textualize/rich>
- PyInstaller operating modes: <https://pyinstaller.org/en/stable/operating-mode.html>
- Go compile/install: <https://go.dev/doc/tutorial/compile-install>
- Go `embed`: <https://pkg.go.dev/embed>
- Bubble Tea: <https://github.com/charmbracelet/bubbletea>
