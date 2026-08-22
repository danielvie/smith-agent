// PROTOTYPE variant F. Throwaway.
// Deliberately breaks the brief's "no large right-hand panel" rule, so the cost of that rule is visible.
import { useState } from "react";
import { Md } from "../md";
import { approvalTitle, argLines, shortPath, type Variant, type VariantProps } from "../kit";
import type { PMessage } from "../fixtures";

const css = `
.vF { display: grid; grid-template-columns: 1fr auto; height: 100%; background: var(--bg); }
.vF-left { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; }
.vF-top { display: flex; align-items: center; gap: 12px; padding: 10px 22px; border-bottom: 1px solid var(--line); }
.vF-mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700; }
.vF-top code { font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vF-top .vF-spacer { margin-left: auto; }
.vF-state { font-size: 11.5px; color: var(--ink-3); }
.vF-state.on { color: var(--warn); }

.vF-scroll { overflow-y: auto; padding: 26px 22px 10px; }
.vF-thread { display: flex; flex-direction: column; gap: 22px; max-width: 700px; margin: 0 auto; }
.vF-ask { padding: 11px 15px; border-radius: 10px; background: var(--bg-2); font-size: 14.5px; }
.vF-say { font-size: 15px; line-height: 1.65; }
.vF-open { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 1px solid var(--line); border-radius: 9px; text-align: left; font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vF-open:hover { border-color: var(--line-2); background: var(--bg-1); }
.vF-open.is-open { border-color: var(--accent); }
.vF-open.is-running { border-color: rgb(240 184 102 / 45%); color: var(--warn); }
.vF-open em { font-style: normal; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vF-open span { margin-left: auto; font-size: 11px; color: var(--ink-3); }

.vF-pane { display: flex; flex-direction: column; width: 400px; border-left: 1px solid var(--line); background: var(--bg-1); }
.vF-pane-head { display: flex; align-items: center; gap: 10px; padding: 11px 16px; border-bottom: 1px solid var(--line); }
.vF-pane-head strong { font-family: var(--mono); font-size: 12.5px; font-weight: 600; }
.vF-pane-head button { margin-left: auto; color: var(--ink-3); font-size: 15px; }
.vF-pane-head button:hover { color: var(--ink); }
.vF-pane-body { flex: 1; overflow: auto; padding: 14px 16px; }
.vF-pane-body pre { margin: 0; font-family: var(--mono); font-size: 11.5px; line-height: 1.6; color: var(--ink-2); white-space: pre-wrap; }
.vF-pane-sub { margin: 0 0 12px; font-family: var(--mono); font-size: 11px; color: var(--ink-3); }

.vF-empty { display: grid; place-items: center; height: 100%; }
.vF-empty p { max-width: 340px; text-align: center; color: var(--ink-3); font-size: 13.5px; }

.vF-foot { padding: 0 22px 20px; }
.vF-foot-inner { max-width: 700px; margin: 0 auto; }
.vF-approval { margin-bottom: 9px; padding: 13px 15px; border: 1px solid rgb(240 184 102 / 38%); border-radius: 10px; background: rgb(240 184 102 / 6%); }
.vF-approval h4 { margin: 0 0 8px; font-size: 13px; font-weight: 620; color: var(--warn); }
.vF-arg { display: flex; gap: 8px; margin-bottom: 4px; font-family: var(--mono); font-size: 11.5px; }
.vF-arg b { flex: 0 0 60px; font-weight: 500; color: var(--ink-3); }
.vF-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vF-act { display: flex; gap: 7px; margin-top: 11px; }
.vF-approve { padding: 5px 13px; border-radius: 7px; background: var(--warn); color: #1a1408; font-size: 12px; font-weight: 640; }
.vF-deny { padding: 5px 13px; border: 1px solid var(--line-2); border-radius: 7px; color: var(--ink-2); font-size: 12px; }
.vF-q { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; padding: 6px 12px; border: 1px dashed var(--line-2); border-radius: 8px; font-size: 12px; color: var(--ink-2); }
.vF-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vF-q button { color: var(--ink-3); font-size: 11px; }
.vF-q button:hover { color: var(--ink); }
.vF-composer { display: flex; align-items: flex-end; gap: 10px; padding: 11px 13px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--bg-1); }
.vF-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; }
.vF-composer textarea::placeholder { color: var(--ink-3); }
.vF-send { padding: 6px 15px; border-radius: 7px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vF-err { margin: 0 0 7px; font-size: 12px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const [openId, setOpenId] = useState<string | undefined>();
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const open: PMessage | undefined = scenario.messages.find((m) => m.id === openId);

  return (
    <div className="vF">
      <style>{css}</style>

      <div className="vF-left">
        <header className="vF-top">
          <div className="vF-mark">S</div>
          <code>{scenario.workspace}</code>
          <span className="vF-spacer" />
          <span className={`vF-state ${scenario.running ? "on" : ""}`}>{scenario.running ? "working" : "idle"}</span>
          <code>{scenario.model}</code>
        </header>

        <div className="vF-scroll">
          {scenario.messages.length === 0 ? (
            <div className="vF-empty"><p>Nothing to inspect yet. Tool output opens on the right only when you ask for it.</p></div>
          ) : (
            <div className="vF-thread">
              {scenario.messages.map((m, i) =>
                m.role === "user" ? (
                  <div className="vF-ask" key={m.id}>{m.content}</div>
                ) : m.role === "tool" ? (
                  <button
                    className={`vF-open ${openId === m.id ? "is-open" : ""} ${m.status === "running" ? "is-running" : ""}`}
                    key={m.id}
                    onClick={() => setOpenId(openId === m.id ? undefined : m.id)}
                  >
                    <strong>{m.toolName}</strong>
                    <em>{m.args}</em>
                    <span>{m.status === "running" ? "running" : openId === m.id ? "open" : "inspect"}</span>
                  </button>
                ) : (
                  <div className="vF-say" key={m.id}>
                    <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div className="vF-foot">
          <div className="vF-foot-inner">
            {pending.map((a) => (
              <div className="vF-approval" key={a.request.id}>
                <h4>{approvalTitle(a.request.kind)}</h4>
                {argLines(a.request.args).map(([k, v]) => (
                  <div className="vF-arg" key={k}><b>{k}</b><span>{v}</span></div>
                ))}
                <div className="vF-act">
                  <button className="vF-approve" onClick={() => noop("approve")}>Approve</button>
                  <button className="vF-deny" onClick={() => noop("deny")}>Deny</button>
                </div>
              </div>
            ))}
            {scenario.queued.map((q) => (
              <div className="vF-q" key={q.id}>
                <p>{q.message}</p>
                <button onClick={() => noop("edit")}>Edit</button>
                <button onClick={() => noop("cancel")}>Cancel</button>
              </div>
            ))}
            {scenario.error && <p className="vF-err">{scenario.error}</p>}
            <div className="vF-composer">
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ask about ${shortPath(scenario.workspace)}`} />
              <button className="vF-send" onClick={() => noop("send")}>Send</button>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <aside className="vF-pane">
          <div className="vF-pane-head">
            <strong>{open.toolName}</strong>
            <button onClick={() => setOpenId(undefined)}>✕</button>
          </div>
          <div className="vF-pane-body">
            <p className="vF-pane-sub">{open.args}</p>
            <pre>{open.status === "running" ? "running…" : (open.result ?? "no output")}</pre>
          </div>
        </aside>
      )}
    </div>
  );
}

export const variantF: Variant = {
  key: "F",
  name: "Focus pane",
  note: "Right pane exists but is closed until you open a tool run. Breaks the no-right-panel rule on purpose.",
  Component,
};
