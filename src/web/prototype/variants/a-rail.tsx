// PROTOTYPE variant A. Throwaway.
import { useState } from "react";
import { Md } from "../md";
import { approvalTitle, argLines, shortPath, type Variant, type VariantProps } from "../kit";

const css = `
.vA { display: grid; grid-template-columns: auto 1fr; height: 100%; background: var(--bg); }
.vA-rail { display: flex; flex-direction: column; gap: 18px; width: 244px; padding: 18px 16px; border-right: 1px solid var(--line); background: var(--bg-1); }
.vA-rail.is-collapsed { width: 60px; padding: 18px 10px; align-items: center; }
.vA-brand { display: flex; align-items: center; gap: 10px; }
.vA-mark { display: grid; place-items: center; flex: 0 0 28px; width: 28px; height: 28px; border-radius: 8px; background: var(--accent); color: var(--accent-ink); font-weight: 700; font-size: 13px; }
.vA-brand div { min-width: 0; }
.vA-brand strong { display: block; font-size: 13.5px; font-weight: 620; }
.vA-brand span { display: block; font-size: 11.5px; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vA-group { display: flex; flex-direction: column; gap: 3px; }
.vA-group h3 { margin: 0 0 4px; font-size: 10.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3); }
.vA-kv { display: flex; justify-content: space-between; gap: 10px; padding: 4px 0; font-size: 12px; }
.vA-kv span { color: var(--ink-3); }
.vA-kv code { font-family: var(--mono); font-size: 11px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vA-toggle { margin-top: auto; padding: 7px 10px; border-radius: 7px; background: var(--bg-3); color: var(--ink-2); font-size: 12px; }
.vA-main { display: grid; grid-template-rows: auto 1fr auto; min-width: 0; height: 100%; }
.vA-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 26px; border-bottom: 1px solid var(--line); }
.vA-crumb { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vA-head-right { display: flex; align-items: center; gap: 12px; }
.vA-status { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--ink-2); }
.vA-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--ink-3); }
.vA-status.is-running .vA-dot { background: var(--warn); animation: p-pulse 1.4s ease-in-out infinite; }
.vA-status.is-running { color: var(--warn); }
.vA-ghost { padding: 5px 11px; border: 1px solid var(--line-2); border-radius: 7px; color: var(--ink-2); font-size: 12px; }
.vA-scroll { overflow-y: auto; padding: 30px 26px 8px; }
.vA-thread { display: flex; flex-direction: column; gap: 26px; max-width: 760px; margin: 0 auto; }
.vA-user { padding: 12px 16px; border-radius: 12px 12px 12px 4px; background: var(--bg-2); font-size: 14.5px; }
.vA-who { margin-bottom: 7px; font-size: 10.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3); }
.vA-tool { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; border-left: 2px solid var(--line-2); font-size: 12.5px; color: var(--ink-2); }
.vA-tool code { font-family: var(--mono); font-size: 12px; color: var(--ink); }
.vA-tool-args { font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vA-tool.is-running { border-left-color: var(--warn); }
.vA-empty { display: grid; place-items: center; height: 100%; text-align: center; }
.vA-empty p { max-width: 380px; color: var(--ink-3); font-size: 14px; }
.vA-foot { padding: 0 26px 22px; }
.vA-foot-inner { max-width: 760px; margin: 0 auto; }
.vA-approval { margin-bottom: 10px; padding: 14px 16px; border: 1px solid rgb(240 184 102 / 38%); border-radius: 11px; background: rgb(240 184 102 / 7%); }
.vA-approval h4 { margin: 0 0 3px; font-size: 13.5px; font-weight: 620; color: var(--warn); }
.vA-approval p { margin: 0 0 10px; font-size: 12px; color: var(--ink-3); }
.vA-arg { display: grid; grid-template-columns: 66px 1fr; gap: 8px; margin-bottom: 5px; font-family: var(--mono); font-size: 11.5px; }
.vA-arg b { font-weight: 500; color: var(--ink-3); }
.vA-arg span { color: var(--ink); overflow-wrap: anywhere; white-space: pre-wrap; }
.vA-approval-act { display: flex; gap: 8px; margin-top: 12px; }
.vA-approve { padding: 6px 14px; border-radius: 7px; background: var(--warn); color: #1a1408; font-size: 12.5px; font-weight: 640; }
.vA-deny { padding: 6px 14px; border: 1px solid var(--line-2); border-radius: 7px; color: var(--ink-2); font-size: 12.5px; }
.vA-queue { display: flex; flex-direction: column; gap: 5px; margin-bottom: 8px; }
.vA-q { display: flex; align-items: center; gap: 10px; padding: 7px 12px; border: 1px dashed var(--line-2); border-radius: 9px; font-size: 12.5px; color: var(--ink-2); }
.vA-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vA-q button { color: var(--ink-3); font-size: 11.5px; }
.vA-q button:hover { color: var(--ink); }
.vA-q-tag { font-size: 10px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-3); }
.vA-composer { padding: 12px 14px; border: 1px solid var(--line-2); border-radius: 12px; background: var(--bg-1); }
.vA-composer textarea { width: 100%; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; }
.vA-composer textarea::placeholder { color: var(--ink-3); }
.vA-composer-act { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.vA-hint { font-size: 11.5px; color: var(--ink-3); }
.vA-send { padding: 7px 16px; border-radius: 8px; background: var(--accent); color: var(--accent-ink); font-size: 13px; font-weight: 640; }
.vA-err { margin: 0 0 8px; font-size: 12.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const [open, setOpen] = useState(true);
  const pending = scenario.approvals.filter((a) => a.status === "pending");

  return (
    <div className="vA">
      <style>{css}</style>
      <aside className={`vA-rail ${open ? "" : "is-collapsed"}`}>
        <div className="vA-brand">
          <div className="vA-mark">S</div>
          {open && (
            <div>
              <strong>Smith</strong>
              <span>{shortPath(scenario.workspace)}</span>
            </div>
          )}
        </div>
        {open && (
          <div className="vA-group">
            <h3>Session</h3>
            <div className="vA-kv"><span>Model</span><code>{scenario.model}</code></div>
            <div className="vA-kv"><span>Config</span><code>{scenario.configPath}</code></div>
            <div className="vA-kv"><span>Root</span><code>{shortPath(scenario.workspace)}</code></div>
          </div>
        )}
        <button className="vA-toggle" onClick={() => setOpen(!open)}>{open ? "‹ Collapse" : "›"}</button>
      </aside>

      <div className="vA-main">
        <header className="vA-head">
          <div className="vA-crumb">{scenario.workspace}</div>
          <div className="vA-head-right">
            <span className={`vA-status ${scenario.running ? "is-running" : ""}`}>
              <i className="vA-dot" />
              {scenario.running ? "Working" : "Idle"}
            </span>
            <button className="vA-ghost" disabled={!scenario.running} onClick={() => noop("abort")}>Abort</button>
          </div>
        </header>

        <div className="vA-scroll">
          {scenario.messages.length === 0 ? (
            <div className="vA-empty">
              <p>Ask Smith to inspect or change this workspace.</p>
            </div>
          ) : (
            <div className="vA-thread">
              {scenario.messages.map((m, i) =>
                m.role === "user" ? (
                  <div className="vA-user" key={m.id}>
                    <div className="vA-who">You</div>
                    {m.content}
                  </div>
                ) : m.role === "tool" ? (
                  <div className={`vA-tool ${m.status === "running" ? "is-running" : ""}`} key={m.id}>
                    <code>{m.toolName}</code>
                    <span className="vA-tool-args">{m.args}</span>
                    <span style={{ marginLeft: "auto" }}>{m.status === "running" ? "running" : m.result?.split("\n")[0]}</span>
                  </div>
                ) : (
                  <div key={m.id}>
                    <div className="vA-who">Smith</div>
                    <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        <div className="vA-foot">
          <div className="vA-foot-inner">
            {pending.map((a) => (
              <div className="vA-approval" key={a.request.id}>
                <h4>{approvalTitle(a.request.kind)}</h4>
                <p>Smith paused and needs permission to continue.</p>
                {argLines(a.request.args).map(([k, v]) => (
                  <div className="vA-arg" key={k}><b>{k}</b><span>{v}</span></div>
                ))}
                <div className="vA-approval-act">
                  <button className="vA-approve" onClick={() => noop("approve")}>Approve</button>
                  <button className="vA-deny" onClick={() => noop("deny")}>Deny</button>
                </div>
              </div>
            ))}

            {scenario.queued.length > 0 && (
              <div className="vA-queue">
                {scenario.queued.map((q) => (
                  <div className="vA-q" key={q.id}>
                    <span className="vA-q-tag">Queued</span>
                    <p>{q.message}</p>
                    <button onClick={() => noop("edit")}>Edit</button>
                    <button onClick={() => noop("cancel")}>Cancel</button>
                  </div>
                ))}
              </div>
            )}

            {scenario.error && <p className="vA-err">{scenario.error}</p>}

            <div className="vA-composer">
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Smith to inspect or modify the workspace" />
              <div className="vA-composer-act">
                <span className="vA-hint">{scenario.running ? "Send queues behind the current run" : "Enter to send"}</span>
                <button className="vA-send" onClick={() => noop("send")}>Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantA: Variant = {
  key: "A",
  name: "Rail + header",
  note: "Refined baseline: collapsible left rail, compact status header, centered thread.",
  Component,
};
