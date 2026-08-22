// PROTOTYPE variant E. Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, shortPath, type Variant, type VariantProps } from "../kit";

const css = `
.vE { display: flex; flex-direction: column; height: 100%; background: var(--bg); }
.vE.is-empty { justify-content: center; }
.vE-bar { display: flex; align-items: center; gap: 12px; padding: 9px 20px; border-bottom: 1px solid var(--line); }
.vE.is-empty .vE-bar { border-bottom: 0; }
.vE-mark { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700; }
.vE-bar code { font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vE-bar .vE-spacer { margin-left: auto; }
.vE-live { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--ink-3); }
.vE-live.on { color: var(--warn); }
.vE-live i { width: 5px; height: 5px; border-radius: 999px; background: currentColor; }
.vE-live.on i { animation: p-pulse 1.2s ease-in-out infinite; }

.vE-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 26px 20px 18px; }
.vE-thread { display: flex; flex-direction: column; gap: 24px; max-width: 720px; margin: 0 auto; }
.vE-ask { align-self: flex-end; max-width: 78%; padding: 10px 14px; border-radius: 14px 14px 4px 14px; background: var(--bg-3); font-size: 14.5px; }
.vE-say { font-size: 15px; line-height: 1.65; }
.vE-tool { display: flex; gap: 9px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vE-tool b { font-weight: 500; color: var(--ink-2); }
.vE-tool.is-running b { color: var(--warn); }

.vE-anchor { padding: 0 20px 24px; }
.vE.is-empty .vE-anchor { padding-bottom: 0; }
.vE-shell { max-width: 720px; margin: 0 auto; border: 1px solid var(--line-2); border-radius: 14px; background: var(--bg-1); overflow: hidden; }
.vE-shell.is-asking { border-color: rgb(240 184 102 / 55%); background: #1b1710; }
.vE-lede { max-width: 720px; margin: 0 auto 18px; text-align: center; }
.vE-lede h2 { margin: 0 0 6px; font-size: 21px; font-weight: 500; }
.vE-lede p { margin: 0; font-size: 13.5px; color: var(--ink-3); }

.vE-chips { display: flex; flex-wrap: wrap; gap: 6px; padding: 10px 12px 0; }
.vE-chip { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 4px 6px 4px 11px; border: 1px dashed var(--line-2); border-radius: 999px; font-size: 12px; color: var(--ink-2); }
.vE-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }
.vE-chip button { padding: 2px 7px; border-radius: 999px; color: var(--ink-3); font-size: 11px; }
.vE-chip button:hover { background: var(--bg-3); color: var(--ink); }
.vE-chip-n { padding: 4px 10px; border-radius: 999px; background: var(--bg-3); font-size: 11px; color: var(--ink-3); }

.vE-input { display: block; width: 100%; padding: 13px 15px 4px; border: 0; background: none; outline: none; resize: none; font-size: 15px; }
.vE-input::placeholder { color: var(--ink-3); }
.vE-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px 11px; }
.vE-hint { font-size: 11.5px; color: var(--ink-3); }
.vE-send { padding: 7px 17px; border-radius: 9px; background: var(--accent); color: var(--accent-ink); font-size: 13px; font-weight: 640; }
.vE-abort { padding: 6px 12px; border: 1px solid var(--line-2); border-radius: 8px; color: var(--ink-2); font-size: 12px; }

.vE-perm { padding: 15px 16px; }
.vE-perm h4 { margin: 0 0 3px; font-size: 14px; font-weight: 620; color: var(--warn); }
.vE-perm > p { margin: 0 0 11px; font-size: 12px; color: var(--ink-3); }
.vE-arg { display: flex; gap: 9px; margin-bottom: 4px; font-family: var(--mono); font-size: 11.5px; }
.vE-arg b { flex: 0 0 62px; font-weight: 500; color: var(--ink-3); }
.vE-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vE-perm-act { display: flex; align-items: center; gap: 8px; margin-top: 13px; }
.vE-approve { padding: 7px 16px; border-radius: 8px; background: var(--warn); color: #1a1408; font-size: 13px; font-weight: 640; }
.vE-deny { padding: 7px 16px; border: 1px solid var(--line-2); border-radius: 8px; color: var(--ink-2); font-size: 13px; }
.vE-perm-more { margin-left: auto; font-size: 11.5px; color: var(--ink-3); }
.vE-perm + .vE-perm { border-top: 1px solid rgb(240 184 102 / 22%); }
.vE-err { max-width: 720px; margin: 0 auto 8px; font-size: 12.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const asking = pending.length > 0;
  const empty = scenario.messages.length === 0;

  return (
    <div className={`vE ${empty ? "is-empty" : ""}`}>
      <style>{css}</style>

      <header className="vE-bar">
        <div className="vE-mark">S</div>
        <code>{shortPath(scenario.workspace)}</code>
        <span className="vE-spacer" />
        <span className={`vE-live ${scenario.running ? "on" : ""}`}><i />{scenario.running ? "working" : "idle"}</span>
        <code>{scenario.model}</code>
      </header>

      {!empty && (
        <div className="vE-scroll">
          <div className="vE-thread">
            {scenario.messages.map((m, i) =>
              m.role === "user" ? (
                <div className="vE-ask" key={m.id}>{m.content}</div>
              ) : m.role === "tool" ? (
                <div className={`vE-tool ${m.status === "running" ? "is-running" : ""}`} key={m.id}>
                  <b>{m.toolName}</b>
                  <span>{m.args}</span>
                  <span style={{ marginLeft: "auto" }}>{m.status === "running" ? "…" : m.result?.split("\n")[0]}</span>
                </div>
              ) : (
                <div className="vE-say" key={m.id}>
                  <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                </div>
              ),
            )}
          </div>
        </div>
      )}

      <div className="vE-anchor">
        {empty && (
          <div className="vE-lede">
            <h2>Smith is ready</h2>
            <p>{scenario.workspace}</p>
          </div>
        )}

        {scenario.error && <p className="vE-err">{scenario.error}</p>}

        <div className={`vE-shell ${asking ? "is-asking" : ""}`}>
          {asking ? (
            pending.map((a, index) => (
              <div className="vE-perm" key={a.request.id}>
                <h4>{approvalTitle(a.request.kind)}</h4>
                <p>Smith is paused here until you decide.</p>
                {argLines(a.request.args).map(([k, v]) => (
                  <div className="vE-arg" key={k}><b>{k}</b><span>{v}</span></div>
                ))}
                <div className="vE-perm-act">
                  <button className="vE-approve" onClick={() => noop("approve")}>Approve</button>
                  <button className="vE-deny" onClick={() => noop("deny")}>Deny</button>
                  {pending.length > 1 && <span className="vE-perm-more">{index + 1} of {pending.length}</span>}
                </div>
              </div>
            ))
          ) : (
            <>
              {scenario.queued.length > 0 && (
                <div className="vE-chips">
                  <span className="vE-chip-n">Next up</span>
                  {scenario.queued.map((q) => (
                    <span className="vE-chip" key={q.id}>
                      <span>{q.message}</span>
                      <button onClick={() => noop("edit")}>Edit</button>
                      <button onClick={() => noop("cancel")}>✕</button>
                    </span>
                  ))}
                </div>
              )}
              <textarea className="vE-input" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Smith to inspect or modify the workspace" />
              <div className="vE-row">
                <span className="vE-hint">
                  {scenario.running
                    ? scenario.queued.length > 0
                      ? `Send adds to ${scenario.queued.length} waiting`
                      : "Send queues behind the current run"
                    : "Enter to send"}
                </span>
                <div style={{ display: "flex", gap: 8 }}>
                  {scenario.running && <button className="vE-abort" onClick={() => noop("abort")}>Abort</button>}
                  <button className="vE-send" onClick={() => noop("send")}>Send</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export const variantE: Variant = {
  key: "E",
  name: "Composer first",
  note: "Composer is the anchor. Queue lives inside its border; an approval takes the composer over.",
  Component,
};
