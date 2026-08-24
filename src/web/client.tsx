import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Markdown } from "./markdown";
import type { ApprovalDecision, ApprovalState, QueuedPrompt, SmithEvent, UiEvent, UiStateEvent } from "../protocol";

type Density = "read" | "digest";

type TranscriptNode =
  | { id: string; kind: "user"; at: string; content: string }
  | { id: string; kind: "assistant"; at: string; content: string }
  | { id: string; kind: "system"; at: string; content: string }
  | { id: string; kind: "tool"; at: string; toolName: string; args: string; result?: string; status: "running" | "ok" | "error" };

type DecisionHandler = (requestId: string, decision: ApprovalDecision) => void | Promise<void>;

const SIGIL = { user: "›", assistant: "·", tool: "✓", running: "◐", system: "!", approval: "?", queued: "»" };

function makeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function clockNow(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** First readable line of a response, for the digest row. */
function summarise(source: string): string {
  const line = source
    .split("\n")
    .map((entry) => entry.replace(/^[#>\s-]+/u, "").replace(/[*`|]/gu, "").trim())
    .find((entry) => entry.length > 0);
  return line ?? "";
}

function approvalTitle(kind: string): string {
  if (kind === "shell") return "Run a command";
  if (kind === "browser") return "Use the browser";
  if (kind === "web") return "Search the web";
  return "Write to a file";
}

function argEntries(args: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(args).map(([key, value]) => [key, formatValue(value)]);
}

function Node({ tone, at, sigil, kind, summary, active = false, actions, children }: { tone: string; at: string; sigil: string; kind: string; summary: string; active?: boolean; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`node node-${tone}${active ? " node-active" : ""}`}>
      <div className="node-in">
        <span className="node-at">{at}</span>
        <div className="node-row">
          <span className="node-sigil">{sigil}</span>
          <span className="node-summary">{summary}</span>
        </div>
        <div className="node-kind">{sigil} {kind}</div>
        {actions}
        <div className="node-body">{children}</div>
      </div>
    </section>
  );
}

function ToolNode({ node }: { node: Extract<TranscriptNode, { kind: "tool" }> }) {
  const running = node.status === "running";
  return (
    <Node
      tone={running ? "running" : node.status === "error" ? "failed" : "run"}
      at={node.at}
      sigil={running ? SIGIL.running : SIGIL.tool}
      kind={running ? "running" : node.status === "error" ? "failed" : "ran"}
      summary={`${node.toolName} ${node.args}`}
    >
      <p className="tool-call">
        <strong>{node.toolName}</strong> <span>{node.args}</span>
      </p>
      {node.result && <pre className="tool-out">{node.result}</pre>}
      {running && <pre className="tool-out">waiting…</pre>}
    </Node>
  );
}

function ApprovalNode({ approval, decide }: { approval: ApprovalState; decide: DecisionHandler }) {
  const title = approvalTitle(approval.request.kind);
  return (
    <Node tone="approval" at="now" sigil={SIGIL.approval} kind="waiting on you" summary={`${title.toLowerCase()} — ${approval.request.toolName}`}>
      <p className="approval-what">
        {title} — <span>{approval.request.toolName}</span>
      </p>
      {argEntries(approval.request.args).map(([key, value]) => (
        <p className="approval-arg" key={key}>
          <b>{key}</b>
          <span>{value}</span>
        </p>
      ))}
      <div className="approval-actions">
        <button type="button" className="approve" onClick={() => void decide(approval.request.id, "approve")}>
          Approve
        </button>
        <button type="button" className="always" onClick={() => void decide(approval.request.id, "always")}>
          Always approve
        </button>
        <button type="button" className="deny" onClick={() => void decide(approval.request.id, "deny")}>
          Deny
        </button>
        <span>The run is parked until you answer.</span>
      </div>
    </Node>
  );
}

function QueuedNode({ prompt, position, total, onEdit, onCancel }: { prompt: QueuedPrompt; position: number; total: number; onEdit: () => void; onCancel: () => void }) {
  return (
    <Node tone="queued" at={`q${position}`} sigil={SIGIL.queued} kind={`queued ${position}/${total}`} summary={prompt.message}>
      <div className="queued-row">
        <p>{prompt.message}</p>
        <button type="button" onClick={onEdit}>
          Edit
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </Node>
  );
}

function Transcript({
  nodes,
  approvals,
  queued,
  decide,
  editQueued,
  cancelQueued,
  workspace,
  running,
  editSent,
}: {
  nodes: TranscriptNode[];
  approvals: ApprovalState[];
  queued: QueuedPrompt[];
  decide: DecisionHandler;
  editQueued: (prompt: QueuedPrompt) => void;
  cancelQueued: (id: string) => void;
  workspace: string;
  running: boolean;
  editSent: (node: Extract<TranscriptNode, { kind: "user" }>) => void | Promise<void>;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  function onScroll() {
    const element = scroll.current;
    if (!element) return;
    stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
  }

  useLayoutEffect(() => {
    const element = scroll.current;
    if (element && stick.current) element.scrollTop = element.scrollHeight;
  }, [nodes, approvals, queued]);

  const empty = nodes.length === 0 && approvals.length === 0 && queued.length === 0;
  const lastNode = nodes[nodes.length - 1];
  const activeAssistantId = running && lastNode?.kind === "assistant" ? lastNode.id : undefined;
  const showProcessingBand = running && approvals.length === 0 && (!lastNode || lastNode.kind === "user" || (lastNode.kind === "tool" && lastNode.status !== "running"));

  return (
    <div className="scroll" ref={scroll} onScroll={onScroll} aria-live="polite">
      {empty ? (
        <div className="empty">
          <p>
            Ask Smith to inspect or change <code>{workspace}</code>.
            <br />
            Everything it does lands here in order.
          </p>
        </div>
      ) : (
        <>
          {nodes.map((node) => {
            if (node.kind === "user") {
              return (
                <Node
                  tone="user"
                  at={node.at}
                  sigil={SIGIL.user}
                  kind="you"
                  summary={node.content}
                  actions={
                    <div className="node-action-rail">
                      <button type="button" className="node-edit" onClick={() => void editSent(node)} aria-label="Edit and resend this message">
                        Edit
                      </button>
                      <span>branch</span>
                    </div>
                  }
                  key={node.id}
                >
                  <p className="ask">{node.content}</p>
                </Node>
              );
            }
            if (node.kind === "tool") return <ToolNode node={node} key={node.id} />;
            if (node.kind === "system") {
              return (
                <Node tone="system" at={node.at} sigil={SIGIL.system} kind="error" summary={node.content} key={node.id}>
                  <p className="system-text">{node.content}</p>
                </Node>
              );
            }
            return (
              <Node tone="say" at={node.at} sigil={SIGIL.assistant} kind="smith" summary={summarise(node.content)} active={node.id === activeAssistantId} key={node.id}>
                <Markdown source={node.content} />
              </Node>
            );
          })}

          {showProcessingBand && (
            <Node tone="processing" at="now" sigil={SIGIL.assistant} kind="smith" summary="working…" active>
              <p className="assistant-working">working…</p>
            </Node>
          )}

          {approvals.map((approval) => (
            <ApprovalNode approval={approval} decide={decide} key={approval.request.id} />
          ))}

          {queued.map((prompt, index) => (
            <QueuedNode
              prompt={prompt}
              position={index + 1}
              total={queued.length}
              onEdit={() => editQueued(prompt)}
              onCancel={() => cancelQueued(prompt.id)}
              key={prompt.id}
            />
          ))}
        </>
      )}
    </div>
  );
}

function Composer({
  draft,
  setDraft,
  submit,
  running,
  error,
  textareaRef,
}: {
  draft: string;
  setDraft: (value: string) => void;
  submit: (event: Pick<FormEvent, "preventDefault">) => void | Promise<void>;
  running: boolean;
  error?: string;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit(event);
    }
  }

  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      {error && <p className="composer-error">{error}</p>}
      <div className="composer-row">
        <span className="composer-caret" aria-hidden="true">
          {SIGIL.user}
        </span>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={running ? "Send to queue…" : "Ask Smith to inspect or modify the workspace"}
          rows={2}
        />
        <button type="submit">Send</button>
      </div>
    </form>
  );
}

function formatTokenCount(tokens: number): string {
  const rounded = Math.max(0, Math.round(tokens));
  if (rounded < 1_000) return String(rounded);
  if (rounded < 1_000_000) return `${Math.round(rounded / 100) / 10}k`;
  return `${Math.round(rounded / 100_000) / 10}m`;
}

function SessionTitle({
  session,
  contextUsage,
  editing,
  draft,
  setDraft,
  startRename,
  saveRename,
  cancelRename,
}: {
  session?: UiStateEvent["sessions"][number];
  contextUsage?: UiStateEvent["contextUsage"];
  editing: boolean;
  draft: string;
  setDraft: (value: string) => void;
  startRename: () => void;
  saveRename: () => void | Promise<void>;
  cancelRename: () => void;
}) {
  const contextRatio = contextUsage && contextUsage.contextWindow > 0 ? contextUsage.tokens / contextUsage.contextWindow : 0;
  const contextLevel = contextRatio >= 0.9 ? "danger" : contextRatio >= 0.75 ? "warning" : "normal";
  const contextPercent = Math.min(100, Math.max(0, contextRatio * 100));
  const contextValue = contextUsage ? `${contextUsage.estimated ? "Estimated " : ""}context usage: ${formatTokenCount(contextUsage.tokens)} of ${formatTokenCount(contextUsage.contextWindow)} tokens` : "";

  return (
    <section className="session-title-strip">
      <div className="session-title-in">
        <span className="session-title-label">Session</span>
        {editing ? (
          <form className="session-title-form" onSubmit={(event) => { event.preventDefault(); void saveRename(); }}>
            <input
              aria-label="Session name"
              value={draft}
              maxLength={160}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
            />
            <button type="submit" className="session-title-save">Save</button>
            <button type="button" className="session-title-cancel" onClick={cancelRename}>Cancel</button>
          </form>
        ) : (
          <>
            <strong className="session-title-value">{session?.title ?? "New session"}</strong>
            <button type="button" className="session-title-edit" onClick={startRename}>Edit name</button>
          </>
        )}
        {session && <span className="session-title-meta">{session.messageCount} messages</span>}
        {session && contextUsage && (
          <div className={`session-context session-context-${contextLevel}`} title={contextValue}>
            <span className="session-context-label">context</span>
            <span
              className="session-context-track"
              role="progressbar"
              aria-label="Context usage"
              aria-valuemin={0}
              aria-valuemax={contextUsage.contextWindow}
              aria-valuenow={Math.min(contextUsage.tokens, contextUsage.contextWindow)}
              aria-valuetext={contextValue}
            >
              <span className="session-context-fill" style={{ width: `${contextPercent}%` }} />
            </span>
            <span className="session-context-value">{contextUsage.estimated ? "~" : ""}{formatTokenCount(contextUsage.tokens)} / {formatTokenCount(contextUsage.contextWindow)}</span>
          </div>
        )}
      </div>
    </section>
  );
}

function Bar({
  state,
  density,
  setDensity,
  abort,
  createSession,
  selectSession,
}: {
  state: UiStateEvent;
  density: Density;
  setDensity: (value: Density) => void;
  abort: () => void | Promise<void>;
  createSession: () => void | Promise<void>;
  selectSession: (sessionId: string) => void | Promise<void>;
}) {
  const mcpServers = state.mcpServers ?? [];
  const serverCount = mcpServers.length;
  const serverLabel = serverCount === 1 ? "server" : "servers";
  const serverDetails = mcpServers.map((server) => `${server.name} (${server.toolCount} tools)`).join(", ");

  return (
    <header className="bar">
      <div className="bar-main">
        <strong>smith</strong>
        <span className="bar-sep">·</span>
        <span className="bar-path" title={state.workspace}>
          {state.workspace}
        </span>
        <span className="bar-sep">·</span>
        <span className="bar-model">{state.model}</span>
        <span className="bar-spacer" />
        <select className="session-picker" value={state.sessionId} onChange={(event) => void selectSession(event.target.value)} disabled={state.running} aria-label="Session">
          {state.sessions.map((session) => (
            <option value={session.id} key={session.id}>{session.title}</option>
          ))}
        </select>
        <button type="button" className="bar-new" onClick={() => void createSession()} disabled={state.running}>
          New
        </button>
        <span className="density" role="group" aria-label="Transcript mode">
          <button type="button" className={density === "digest" ? "is-on" : ""} onClick={() => setDensity("digest")} aria-pressed={density === "digest"}>
            Timeline
          </button>
          <button type="button" className={density === "read" ? "is-on" : ""} onClick={() => setDensity("read")} aria-pressed={density === "read"}>
            Conversation
          </button>
        </span>
        <button type="button" className="bar-abort" onClick={() => void abort()} disabled={!state.running}>
          Abort
        </button>
      </div>
      {serverCount > 0 && (
        <div className="mcp-track" title={serverDetails} aria-label={`MCP: ${serverCount} ${serverLabel} enabled`}>
          <span className="mcp-sigil" aria-hidden="true">⚑</span>
          <span><strong>MCP:</strong> {serverCount} {serverLabel} enabled</span>
        </div>
      )}
    </header>
  );
}

function App() {
  const [nodes, setNodes] = useState<TranscriptNode[]>([]);
  const [approvals, setApprovals] = useState<ApprovalState[]>([]);
  const [draft, setDraft] = useState("");
  const [density, setDensity] = useState<Density>("read");
  const [state, setState] = useState<UiStateEvent>({
    type: "state",
    workspace: "loading",
    model: "loading",
    configPath: "smith.config.json",
    running: false,
    sessionId: "",
    sessions: [],
    history: [],
    approvals: [],
    queuedPrompts: [],
    mcpServers: [],
  });
  const [error, setError] = useState<string | undefined>();
  const [renamingSession, setRenamingSession] = useState(false);
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const source = new EventSource("/events");
    source.onmessage = (message) => {
      try {
        handleEvent(JSON.parse(message.data) as UiEvent);
      } catch (eventError) {
        setError(eventError instanceof Error ? eventError.message : String(eventError));
      }
    };
    return () => source.close();
  }, []);

  function handleEvent(event: UiEvent) {
    if (event.type === "state") {
      setState(event);
      setNodes([]);
      setApprovals(event.approvals);
      for (const historyEvent of event.history) applyAgentEvent(historyEvent);
      return;
    }
    if (event.type === "approval_request" || event.type === "approval_update") {
      setApprovals((current) => {
        const without = current.filter((item) => item.request.id !== event.approval.request.id);
        return [...without, event.approval].sort((left, right) => left.createdAt - right.createdAt);
      });
      return;
    }
    applyAgentEvent(event);
  }

  function applyAgentEvent(event: SmithEvent) {
    if (event.type === "prompt_start") {
      setNodes((current) => [...current, { id: event.promptId, kind: "user", at: clockNow(), content: event.message }]);
      return;
    }
    if (event.type === "text_delta") {
      setNodes((current) => {
        const last = current[current.length - 1];
        if (last?.kind === "assistant") return [...current.slice(0, -1), { ...last, content: last.content + event.delta }];
        return [...current, { id: makeId("assistant"), kind: "assistant", at: clockNow(), content: event.delta }];
      });
      return;
    }
    if (event.type === "thinking_delta") return;
    if (event.type === "tool_start") {
      setNodes((current) => [
        ...current,
        { id: event.toolCallId, kind: "tool", at: clockNow(), toolName: event.toolName, args: formatValue(event.args), status: "running" },
      ]);
      return;
    }
    if (event.type === "tool_update") {
      setNodes((current) =>
        current.map((node) => (node.id === event.toolCallId && node.kind === "tool" ? { ...node, result: formatValue(event.partialResult) } : node)),
      );
      return;
    }
    if (event.type === "tool_end") {
      setNodes((current) =>
        current.map((node) =>
          node.id === event.toolCallId && node.kind === "tool"
            ? { ...node, result: formatValue(event.result), status: event.isError ? "error" : "ok" }
            : node,
        ),
      );
      return;
    }
    if (event.type === "error") {
      setError(event.message);
      setNodes((current) => [...current, { id: makeId("error"), kind: "system", at: clockNow(), content: event.message }]);
    }
  }

  async function post(path: string, body: Record<string, unknown> = {}) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : `Request failed: ${response.status}`);
  }

  async function submit(event: Pick<FormEvent, "preventDefault">) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setError(undefined);
    setDraft("");
    try {
      await post("/api/prompt", { message });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function decide(requestId: string, decision: ApprovalDecision) {
    try {
      await post("/api/approval", { requestId, decision });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function abort() {
    try {
      await post("/api/abort");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function createSession() {
    setRenamingSession(false);
    try {
      await post("/api/session/new");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function selectSession(sessionId: string) {
    if (!sessionId || sessionId === state.sessionId) return;
    setRenamingSession(false);
    try {
      await post("/api/session/select", { sessionId });
      setError(undefined);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  function startRenameSession() {
    const session = state.sessions.find((item) => item.id === state.sessionId);
    setSessionTitleDraft(session?.title ?? "New session");
    setError(undefined);
    setRenamingSession(true);
  }

  function cancelRenameSession() {
    setRenamingSession(false);
    setSessionTitleDraft("");
  }

  async function saveRenameSession() {
    const title = sessionTitleDraft.trim();
    if (!title) {
      setError("Session name cannot be empty.");
      return;
    }
    try {
      await post("/api/session/rename", { title });
      setRenamingSession(false);
      setSessionTitleDraft("");
      setError(undefined);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function cancelQueued(queueId: string) {
    try {
      await post("/api/queue/cancel", { queueId });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  async function editQueued(prompt: QueuedPrompt) {
    setDraft(prompt.message);
    await cancelQueued(prompt.id);
    composerRef.current?.focus();
  }

  async function editSent(node: Extract<TranscriptNode, { kind: "user" }>) {
    try {
      await post("/api/session/branch", { promptId: node.id });
      setDraft(node.content);
      setError(undefined);
      composerRef.current?.focus();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : String(requestError));
    }
  }

  const pending = approvals.filter((approval) => approval.status === "pending");
  const activeSession = state.sessions.find((session) => session.id === state.sessionId);

  return (
    <main className="app" data-density={density}>
      <Bar state={state} density={density} setDensity={setDensity} abort={abort} createSession={createSession} selectSession={selectSession} />
      <SessionTitle
        session={activeSession}
        contextUsage={state.contextUsage}
        editing={renamingSession}
        draft={sessionTitleDraft}
        setDraft={setSessionTitleDraft}
        startRename={startRenameSession}
        saveRename={saveRenameSession}
        cancelRename={cancelRenameSession}
      />
      <Transcript
        nodes={nodes}
        approvals={pending}
        queued={state.queuedPrompts}
        decide={decide}
        editQueued={(prompt) => void editQueued(prompt)}
        cancelQueued={(id) => void cancelQueued(id)}
        workspace={state.workspace}
        running={state.running}
        editSent={editSent}
      />
      <Composer draft={draft} setDraft={setDraft} submit={submit} running={state.running} error={error} textareaRef={composerRef} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
