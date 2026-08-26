import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { Markdown } from "./markdown";
import type { ApprovalDecision, ApprovalState, QueuedPrompt, SmithEvent, UiEvent, UiStateEvent } from "../protocol";

type Density = "read" | "digest";

const DENSITY_STORAGE_KEY = "smith.transcript-density";

function storedDensity(): Density {
  try {
    const value = localStorage.getItem(DENSITY_STORAGE_KEY);
    return value === "digest" || value === "read" ? value : "read";
  } catch {
    return "read";
  }
}

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

function Node({ tone, at, sigil, kind, summary, active = false, actions, expanded = false, onToggle, children }: { tone: string; at: string; sigil: string; kind: string; summary: string; active?: boolean; actions?: React.ReactNode; expanded?: boolean; onToggle?: () => void; children: React.ReactNode }) {
  const row = (
    <>
      <span className="node-sigil">{sigil}</span>
      <span className="node-summary min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{summary}</span>
      {onToggle && <span className="shrink-0 text-[13px] leading-none text-ink-4" aria-hidden="true">{expanded ? "−" : "+"}</span>}
    </>
  );
  return (
    <section className={`node node-${tone}${active ? " node-active" : ""}${expanded ? " node-expanded" : ""}`}>
      <div className="node-in">
        <span className="node-at">{at}</span>
        {onToggle ? (
          <button type="button" className="node-row node-toggle p-0 text-left outline-none" onClick={onToggle} aria-expanded={expanded} aria-label={`${expanded ? "Collapse" : "Expand"} ${kind} item`}>
            {row}
          </button>
        ) : (
          <div className="node-row">{row}</div>
        )}
        <div className="node-kind">{sigil} {kind}</div>
        {actions}
        <div className="node-body">{children}</div>
      </div>
    </section>
  );
}

function ToolNode({ node, expanded, onToggle }: { node: Extract<TranscriptNode, { kind: "tool" }>; expanded: boolean; onToggle: () => void }) {
  const running = node.status === "running";
  return (
    <Node
      tone={running ? "running" : node.status === "error" ? "failed" : "run"}
      at={node.at}
      sigil={running ? SIGIL.running : SIGIL.tool}
      kind={running ? "running" : node.status === "error" ? "failed" : "ran"}
      summary={`${node.toolName} ${node.args}`}
      expanded={expanded}
      onToggle={onToggle}
    >
      <p className="m-0 font-mono text-[12px] text-ink-2">
        <strong>{node.toolName}</strong> <span className="text-ink-3 [overflow-wrap:anywhere]">{node.args}</span>
      </p>
      {node.result && <pre className="mt-1.5 mb-0 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-[1.6] text-[#6b7383] [overflow-wrap:anywhere]">{node.result}</pre>}
      {running && <pre className="mt-1.5 mb-0 max-w-full overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-[1.6] text-[#6b7383] [overflow-wrap:anywhere]">waiting…</pre>}
    </Node>
  );
}

function ApprovalNode({ approval, decide }: { approval: ApprovalState; decide: DecisionHandler }) {
  const title = approvalTitle(approval.request.kind);
  return (
    <Node tone="approval" at="now" sigil={SIGIL.approval} kind="waiting on you" summary={`${title.toLowerCase()} — ${approval.request.toolName}`}>
      <p className="mt-0 mb-1.5 font-mono text-[12.5px] text-ink">
        {title} — <span className="text-ink-3">{approval.request.toolName}</span>
      </p>
      {argEntries(approval.request.args).map(([key, value]) => (
        <p className="mb-[3px] grid grid-cols-[62px_minmax(0,1fr)] gap-[9px] font-mono text-[11.5px] text-ink-2" key={key}>
          <b className="font-normal text-ink-3">{key}</b>
          <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{value}</span>
        </p>
      ))}
      <div className="mt-3 flex flex-wrap items-center gap-[9px] font-mono text-[12px]">
        <button type="button" className="rounded-[3px] bg-warn px-3.5 py-1 font-bold text-warn-ink" onClick={() => void decide(approval.request.id, "approve")}>
          Approve
        </button>
        <button type="button" className="rounded-[3px] border border-accent px-3.5 py-1 text-accent" onClick={() => void decide(approval.request.id, "always")}>
          Always approve
        </button>
        <button type="button" className="rounded-[3px] border border-line-2 px-3.5 py-1 text-ink-2" onClick={() => void decide(approval.request.id, "deny")}>
          Deny
        </button>
        <span className="text-ink-3">The run is parked until you answer.</span>
      </div>
    </Node>
  );
}

function QueuedNode({ prompt, position, total, onEdit, onCancel }: { prompt: QueuedPrompt; position: number; total: number; onEdit: () => void; onCancel: () => void }) {
  return (
    <Node tone="queued" at={`q${position}`} sigil={SIGIL.queued} kind={`queued ${position}/${total}`} summary={prompt.message}>
      <div className="flex items-center gap-2.5 font-mono text-[12px] text-[#7b8496]">
        <p className="m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{prompt.message}</p>
        <button type="button" className="text-[11px] text-[#5a6273] hover:text-ink" onClick={onEdit}>
          Edit
        </button>
        <button type="button" className="text-[11px] text-[#5a6273] hover:text-ink" onClick={onCancel}>
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
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

  const toggleNode = (nodeId: string) => setExpandedNodeId((current) => current === nodeId ? null : nodeId);

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
    <div className="overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable]" ref={scroll} onScroll={onScroll} aria-live="polite">
      {empty ? (
        <div className="grid h-full place-items-center p-6">
          <p className="m-0 max-w-[460px] text-center font-mono text-[12.5px] leading-[1.8] text-ink-3">
            Ask Smith to inspect or change <code className="text-ink-2 [overflow-wrap:anywhere]">{workspace}</code>.
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
                  expanded={expandedNodeId === node.id}
                  onToggle={() => toggleNode(node.id)}
                  actions={
                    <div className="absolute inset-y-0 right-0 flex w-[92px] flex-col items-center justify-center gap-px border-l border-line text-ink-4">
                      <button type="button" className="rounded-[3px] border border-line-2 px-2 py-0.5 font-mono text-[11px] text-ink-3 hover:text-ink" onClick={() => void editSent(node)} aria-label="Edit and resend this message">
                        Edit
                      </button>
                      <span className="font-mono text-[9px] tracking-[.08em] uppercase">branch</span>
                    </div>
                  }
                  key={node.id}
                >
                  <p className="m-0 text-[15.5px] leading-[1.5] text-[#f4f6fb]">{node.content}</p>
                </Node>
              );
            }
            if (node.kind === "tool") return <ToolNode node={node} expanded={expandedNodeId === node.id} onToggle={() => toggleNode(node.id)} key={node.id} />;
            if (node.kind === "system") {
              return (
                <Node tone="system" at={node.at} sigil={SIGIL.system} kind="error" summary={node.content} expanded={expandedNodeId === node.id} onToggle={() => toggleNode(node.id)} key={node.id}>
                  <p className="m-0 font-mono text-[12.5px] text-danger">{node.content}</p>
                </Node>
              );
            }
            return (
              <Node tone="say" at={node.at} sigil={SIGIL.assistant} kind="smith" summary={summarise(node.content)} active={node.id === activeAssistantId} expanded={expandedNodeId === node.id} onToggle={() => toggleNode(node.id)} key={node.id}>
                <Markdown source={node.content} />
              </Node>
            );
          })}

          {showProcessingBand && (
            <Node tone="processing" at="now" sigil={SIGIL.assistant} kind="smith" summary="working…" active>
              <p className="m-0 animate-[smith-pulse_1.1s_ease-in-out_infinite] font-mono text-[12px] text-ink-3">working…</p>
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
    <form className="border-t border-line bg-bg-bar" onSubmit={(event) => void submit(event)}>
      {error && <p className="mx-auto mt-0 max-w-measure px-[26px] pt-2.5 pb-0 [padding-left:var(--gutter)] font-mono text-[11.5px] text-danger">{error}</p>}
      <div className="mx-auto flex max-w-measure items-start gap-2.5 pt-[11px] pr-[26px] pb-[15px] [padding-left:calc(var(--gutter)-22px)] max-[700px]:[padding-left:calc(var(--gutter)-20px)]">
        <span className="pt-[3px] font-mono text-[13px] text-accent" aria-hidden="true">
          {SIGIL.user}
        </span>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={running ? "Send to queue…" : "Ask Smith to inspect or modify the workspace"}
          rows={2}
          className="min-w-0 flex-1 resize-none border-0 bg-transparent text-[14.5px] leading-[1.5] outline-none placeholder:text-ink-5"
        />
        <button type="submit" className="rounded-sm bg-accent px-[15px] py-[5px] text-[12.5px] font-[640] text-accent-ink hover:brightness-[1.08]">Send</button>
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
  const contextTone = contextLevel === "danger" ? "text-danger" : contextLevel === "warning" ? "text-warn" : "text-ink-3";
  const contextFill = contextLevel === "danger" ? "bg-danger" : contextLevel === "warning" ? "bg-warn" : "bg-accent";

  return (
    <section className="border-b border-line bg-[#151821]">
      <div className="mx-auto flex min-h-14 max-w-measure items-center gap-3 py-2.5 pr-[26px] pb-[11px] [padding-left:var(--gutter)] max-[700px]:gap-2 max-[700px]:pr-[18px]">
        <span className="shrink-0 font-mono text-[10.5px] tracking-[.08em] text-ink-3 uppercase">Session</span>
        {editing ? (
          <form className="flex min-w-0 flex-1 items-center gap-[7px]" onSubmit={(event) => { event.preventDefault(); void saveRename(); }}>
            <input
              aria-label="Session name"
              value={draft}
              maxLength={160}
              autoFocus
              onChange={(event) => setDraft(event.target.value)}
              className="w-[min(520px,100%)] min-w-0 rounded-[3px] border border-line-2 bg-bg-code px-[9px] py-[7px] font-mono text-[13px] text-ink outline-none focus:border-accent"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
            />
            <button type="submit" className="shrink-0 rounded-[3px] bg-accent px-[11px] py-1.5 font-mono text-[10.5px] font-[650] text-accent-ink">Save</button>
            <button type="button" className="shrink-0 font-mono text-[10.5px] text-ink-3 hover:text-ink" onClick={cancelRename}>Cancel</button>
          </form>
        ) : (
          <>
            <strong className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[14px] font-medium text-ink">{session?.title ?? "New session"}</strong>
            <button type="button" className="shrink-0 font-mono text-[10.5px] text-ink-3 hover:text-ink" onClick={startRename}>Edit name</button>
          </>
        )}
        {session && <span className="ml-auto shrink-0 font-mono text-[10px] text-ink-4 max-[700px]:hidden">{session.messageCount} messages</span>}
        {session && contextUsage && (
          <div className="flex shrink-0 items-center gap-[7px] whitespace-nowrap font-mono text-[10px] text-ink-3 max-[700px]:gap-[5px]" title={contextValue}>
            <span className={`${contextTone} max-[700px]:hidden`}>context</span>
            <span
              className="block h-[5px] w-16 overflow-hidden rounded-[3px] border border-line-2 bg-bg-code max-[700px]:w-[42px]"
              role="progressbar"
              aria-label="Context usage"
              aria-valuemin={0}
              aria-valuemax={contextUsage.contextWindow}
              aria-valuenow={Math.min(contextUsage.tokens, contextUsage.contextWindow)}
              aria-valuetext={contextValue}
            >
              <span className={`block h-full rounded-[inherit] ${contextFill}`} style={{ width: `${contextPercent}%` }} />
            </span>
            <span className={contextLevel === "normal" ? "text-ink-2" : contextTone}>{contextUsage.estimated ? "~" : ""}{formatTokenCount(contextUsage.tokens)} / {formatTokenCount(contextUsage.contextWindow)}</span>
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
  deleteSession,
  selectSession,
}: {
  state: UiStateEvent;
  density: Density;
  setDensity: (value: Density) => void;
  abort: () => void | Promise<void>;
  createSession: () => void | Promise<void>;
  deleteSession: () => void | Promise<void>;
  selectSession: (sessionId: string) => void | Promise<void>;
}) {
  const mcpServers = state.mcpServers ?? [];
  const serverCount = mcpServers.length;
  const serverLabel = serverCount === 1 ? "server" : "servers";
  const serverDetails = mcpServers.map((server) => `${server.name} (${server.toolCount} tools)`).join(", ");

  return (
    <header className="grid gap-1 border-b border-line bg-bg-bar px-[18px] py-[7px] font-mono text-[11.5px] text-ink-3">
      <div className="flex min-w-0 items-center">
        <strong className="font-semibold text-accent">smith</strong>
        <span className="mx-2 text-line-2">·</span>
        <span className="max-w-[40vw] overflow-hidden text-ellipsis whitespace-nowrap max-[700px]:max-w-[30vw]" title={state.workspace}>
          {state.workspace}
        </span>
        <span className="mx-2 text-line-2">·</span>
        <span className="overflow-hidden text-ellipsis whitespace-nowrap max-[700px]:hidden">{state.model}</span>
        <span className="min-w-3 flex-1" />
        <select className="max-w-[180px] rounded-[3px] border border-line-2 bg-bg-bar px-2 py-[3px] font-mono text-[11px] text-ink-2" value={state.sessionId} onChange={(event) => void selectSession(event.target.value)} disabled={state.running} aria-label="Session">
          {state.sessions.map((session) => (
            <option value={session.id} key={session.id}>{session.title}</option>
          ))}
        </select>
        <button type="button" className="ml-[5px] max-w-[180px] rounded-[3px] border border-line-2 bg-bg-bar px-2 py-[3px] font-mono text-[11px] text-accent" onClick={() => void createSession()} disabled={state.running}>
          New
        </button>
        <button type="button" className="ml-[5px] max-w-[180px] rounded-[3px] border border-line-2 bg-bg-bar px-2 py-[3px] font-mono text-[11px] text-danger disabled:text-ink-5" onClick={() => void deleteSession()} disabled={state.running || !state.sessionId}>
          Delete
        </button>
        <span className="ml-2.5 inline-flex overflow-hidden rounded-[3px] border border-line-2" role="group" aria-label="Transcript mode">
          <button type="button" className={`px-[11px] py-[3px] font-mono text-[11px] ${density === "digest" ? "bg-[#252a36] text-ink" : "text-ink-3"}`} onClick={() => setDensity("digest")} aria-pressed={density === "digest"}>
            Timeline
          </button>
          <button type="button" className={`px-[11px] py-[3px] font-mono text-[11px] ${density === "read" ? "bg-[#252a36] text-ink" : "text-ink-3"}`} onClick={() => setDensity("read")} aria-pressed={density === "read"}>
            Conversation
          </button>
        </span>
        <button type="button" className="ml-2 rounded-[3px] border border-line-2 px-2.5 py-[3px] font-mono text-[11px] text-ink-2" onClick={() => void abort()} disabled={!state.running}>
          Abort
        </button>
      </div>
      {serverCount > 0 && (
        <div className="flex min-w-0 items-center gap-2 text-[12px] leading-[1.2] text-ok" title={serverDetails} aria-label={`MCP: ${serverCount} ${serverLabel} enabled`}>
          <span className="text-[14px] leading-none text-mcp" aria-hidden="true">⚑</span>
          <span><strong className="text-inherit">MCP:</strong> {serverCount} {serverLabel} enabled</span>
        </div>
      )}
    </header>
  );
}

function App() {
  const [nodes, setNodes] = useState<TranscriptNode[]>([]);
  const [approvals, setApprovals] = useState<ApprovalState[]>([]);
  const [draft, setDraft] = useState("");
  const [density, setDensity] = useState<Density>(storedDensity);
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
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, density);
    } catch {
      // Browsers can disable storage; the in-memory preference still works.
    }
  }, [density]);

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

  async function deleteSession() {
    const session = state.sessions.find((item) => item.id === state.sessionId);
    if (!session || !window.confirm(`Delete session "${session.title}"? This cannot be undone.`)) return;
    setRenamingSession(false);
    try {
      await post("/api/session/delete", { sessionId: session.id });
      setError(undefined);
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
    <main className="app grid h-full grid-rows-[auto_auto_minmax(0,1fr)_auto]" data-density={density}>
      <Bar state={state} density={density} setDensity={setDensity} abort={abort} createSession={createSession} deleteSession={deleteSession} selectSession={selectSession} />
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
