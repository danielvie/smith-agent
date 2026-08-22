// PROTOTYPE variant C. Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, shortPath, type Variant, type VariantProps } from "../kit";

const css = `
.vC { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: var(--bg); }
.vC-top { display: flex; align-items: center; gap: 14px; padding: 10px 22px; border-bottom: 1px solid var(--line); }
.vC-mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700; }
.vC-top code { font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vC-top .vC-spacer { margin-left: auto; }
.vC-state { font-size: 11.5px; color: var(--ink-3); }
.vC-state.is-running { color: var(--warn); }

.vC-scroll { overflow-y: auto; padding: 28px 22px 10px; }
.vC-grid { display: grid; grid-template-columns: minmax(0, 660px) 232px; gap: 34px; justify-content: center; }
.vC-col { display: flex; flex-direction: column; gap: 28px; }
.vC-gutter { position: relative; }
.vC-note { padding-left: 12px; border-left: 1px solid var(--line); font-size: 11.5px; line-height: 1.5; color: var(--ink-3); }
.vC-note + .vC-note { margin-top: 14px; }
.vC-note b { display: block; margin-bottom: 3px; font-family: var(--mono); font-size: 11px; font-weight: 500; color: var(--ink-2); }
.vC-note pre { margin: 5px 0 0; padding: 0; overflow-x: auto; font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); white-space: pre-wrap; }
.vC-note.is-running { border-left-color: var(--warn); color: var(--warn); }
.vC-note.is-running b { color: var(--warn); }
.vC-note.is-approval { padding: 10px 12px; border: 1px solid rgb(240 184 102 / 40%); border-left-width: 2px; border-radius: 0 9px 9px 0; background: rgb(240 184 102 / 6%); color: var(--ink-2); }
.vC-note.is-approval b { color: var(--warn); }
.vC-note-act { display: flex; gap: 6px; margin-top: 9px; }
.vC-approve { padding: 4px 11px; border-radius: 6px; background: var(--warn); color: #1a1408; font-size: 11.5px; font-weight: 640; }
.vC-deny { padding: 4px 11px; border: 1px solid var(--line-2); border-radius: 6px; color: var(--ink-2); font-size: 11.5px; }

.vC-ask { font-size: 15px; padding: 11px 15px; border-radius: 3px; background: var(--bg-2); border-left: 2px solid var(--accent); }
.vC-say { font-size: 15px; line-height: 1.65; }
.vC-empty { display: grid; place-items: center; height: 100%; }
.vC-empty p { max-width: 340px; text-align: center; color: var(--ink-3); font-size: 13.5px; }

.vC-foot { padding: 0 22px 20px; }
.vC-foot-grid { display: grid; grid-template-columns: minmax(0, 660px) 232px; gap: 34px; justify-content: center; }
.vC-composer { padding: 12px 14px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--bg-1); }
.vC-composer textarea { width: 100%; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; }
.vC-composer textarea::placeholder { color: var(--ink-3); }
.vC-composer-act { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.vC-hint { font-size: 11.5px; color: var(--ink-3); }
.vC-send { padding: 6px 15px; border-radius: 7px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vC-queue { margin-bottom: 7px; }
.vC-q { display: flex; align-items: center; gap: 9px; padding: 6px 12px; border-left: 2px solid var(--line-2); font-size: 12px; color: var(--ink-2); }
.vC-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vC-q button { color: var(--ink-3); font-size: 11px; }
.vC-q button:hover { color: var(--ink); }
.vC-q-tag { font-family: var(--mono); font-size: 10px; color: var(--ink-3); }
.vC-err { margin: 0 0 7px; font-size: 12px; color: var(--danger); }
.vC-side-note { font-size: 11px; line-height: 1.5; color: var(--ink-3); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const tools = scenario.messages.filter((m) => m.role === "tool");
  const turns = scenario.messages.filter((m) => m.role !== "tool");

  return (
    <div className="vC">
      <style>{css}</style>

      <header className="vC-top">
        <div className="vC-mark">S</div>
        <code>{scenario.workspace}</code>
        <span className="vC-spacer" />
        <span className={`vC-state ${scenario.running ? "is-running" : ""}`}>{scenario.running ? "working" : "idle"}</span>
        <code>{scenario.model}</code>
      </header>

      <div className="vC-scroll">
        {scenario.messages.length === 0 ? (
          <div className="vC-empty"><p>Ask a question. Anything Smith runs shows up in the margin, not in the middle of the answer.</p></div>
        ) : (
          <div className="vC-grid">
            <div className="vC-col">
              {turns.map((m, i) =>
                m.role === "user" ? (
                  <div className="vC-ask" key={m.id}>{m.content}</div>
                ) : (
                  <div className="vC-say" key={m.id}>
                    <Md source={m.content} className={scenario.streamingTail && i === turns.length - 1 ? "p-caret" : ""} />
                  </div>
                ),
              )}
            </div>

            <div className="vC-gutter">
              <div className="vC-side-note" style={{ marginBottom: 16 }}>
                {tools.length} run{tools.length === 1 ? "" : "s"} in this turn
              </div>
              {tools.map((t) => (
                <div className={`vC-note ${t.status === "running" ? "is-running" : ""}`} key={t.id}>
                  <b>{t.toolName}</b>
                  {t.args}
                  {t.status === "running" ? <pre>running…</pre> : t.result && <pre>{t.result}</pre>}
                </div>
              ))}
              {pending.map((a) => (
                <div className="vC-note is-approval" key={a.request.id}>
                  <b>{approvalTitle(a.request.kind)}</b>
                  {argLines(a.request.args).map(([k, v]) => (
                    <pre key={k}>{k}: {v}</pre>
                  ))}
                  <div className="vC-note-act">
                    <button className="vC-approve" onClick={() => noop("approve")}>Approve</button>
                    <button className="vC-deny" onClick={() => noop("deny")}>Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="vC-foot">
        <div className="vC-foot-grid">
          <div>
            {scenario.queued.length > 0 && (
              <div className="vC-queue">
                {scenario.queued.map((q) => (
                  <div className="vC-q" key={q.id}>
                    <span className="vC-q-tag">queued</span>
                    <p>{q.message}</p>
                    <button onClick={() => noop("edit")}>Edit</button>
                    <button onClick={() => noop("cancel")}>Cancel</button>
                  </div>
                ))}
              </div>
            )}
            {scenario.error && <p className="vC-err">{scenario.error}</p>}
            <div className="vC-composer">
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Smith to inspect or modify the workspace" />
              <div className="vC-composer-act">
                <span className="vC-hint">{scenario.running ? "Send queues behind the current run" : "Enter to send"}</span>
                <button className="vC-send" onClick={() => noop("send")}>Send</button>
              </div>
            </div>
          </div>
          <div className="vC-side-note">
            {pending.length > 0
              ? `${pending.length} approval${pending.length === 1 ? "" : "s"} waiting in the margin`
              : scenario.queued.length > 0
                ? `${scenario.queued.length} message${scenario.queued.length === 1 ? "" : "s"} queued`
                : shortPath(scenario.workspace)}
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantC: Variant = {
  key: "C",
  name: "Margin notes",
  note: "Tool runs and approvals live in a slim right gutter, aligned to the turn that spawned them.",
  Component,
};
