// PROTOTYPE variant H. Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vH { display: grid; grid-template-rows: auto auto 1fr auto; height: 100%; background: var(--bg); }
.vH-rail { display: flex; align-items: center; gap: 0; height: 46px; padding: 0 16px; border-bottom: 1px solid var(--line); background: var(--bg-1); }
.vH-mark { display: grid; place-items: center; width: 24px; height: 24px; margin-right: 14px; border-radius: 7px; background: var(--accent); color: var(--accent-ink); font-size: 12px; font-weight: 700; }
.vH-seg { display: flex; align-items: baseline; gap: 7px; padding: 0 14px; border-left: 1px solid var(--line); height: 46px; align-items: center; }
.vH-seg:first-of-type { border-left: 0; padding-left: 0; }
.vH-seg span { font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-3); }
.vH-seg code { font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vH-rail .vH-spacer { flex: 1; }
.vH-live { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px; border-radius: 999px; background: var(--bg-3); font-size: 11.5px; color: var(--ink-2); }
.vH-live.on { background: rgb(240 184 102 / 14%); color: var(--warn); }
.vH-live i { width: 5px; height: 5px; border-radius: 999px; background: currentColor; }
.vH-live.on i { animation: p-pulse 1.2s ease-in-out infinite; }
.vH-abort { margin-left: 10px; padding: 5px 12px; border: 1px solid var(--line-2); border-radius: 7px; color: var(--ink-2); font-size: 12px; }

.vH-progress { height: 2px; background: transparent; }
.vH-progress.on { background: linear-gradient(90deg, transparent, var(--warn), transparent); background-size: 40% 100%; background-repeat: no-repeat; animation: vH-slide 1.6s linear infinite; }
@keyframes vH-slide { from { background-position: -40% 0; } to { background-position: 140% 0; } }

.vH-scroll { overflow-y: auto; padding: 34px 32px 12px; }
.vH-thread { display: flex; flex-direction: column; gap: 30px; max-width: 900px; margin: 0 auto; }
.vH-turn { display: grid; grid-template-columns: 72px 1fr; gap: 22px; }
.vH-who { padding-top: 2px; font-size: 11px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); text-align: right; }
.vH-who.is-you { color: var(--accent); }
.vH-ask { font-size: 15.5px; line-height: 1.55; color: #f4f6fb; }
.vH-say { font-size: 15px; line-height: 1.66; }
.vH-tool { display: flex; gap: 12px; font-family: var(--mono); font-size: 12px; color: var(--ink-3); }
.vH-tool b { font-weight: 500; color: var(--ink-2); }
.vH-tool.on b { color: var(--warn); }
.vH-tool-out { margin: 6px 0 0; font-family: var(--mono); font-size: 11px; color: var(--ink-3); white-space: pre-wrap; }

.vH-empty { display: grid; place-items: center; height: 100%; }
.vH-empty div { max-width: 420px; text-align: center; }
.vH-empty h2 { margin: 0 0 8px; font-size: 20px; font-weight: 500; color: var(--ink-2); }
.vH-empty p { margin: 0; font-size: 13.5px; color: var(--ink-3); }

.vH-foot { padding: 0 32px 24px; }
.vH-foot-in { max-width: 900px; margin: 0 auto; padding-left: 94px; }
.vH-approval { margin-bottom: 10px; padding: 14px 16px; border: 1px solid rgb(240 184 102 / 38%); border-radius: 10px; background: rgb(240 184 102 / 6%); }
.vH-approval h4 { margin: 0 0 8px; font-size: 13px; font-weight: 620; color: var(--warn); }
.vH-arg { display: flex; gap: 8px; margin-bottom: 4px; font-family: var(--mono); font-size: 11.5px; }
.vH-arg b { flex: 0 0 60px; font-weight: 500; color: var(--ink-3); }
.vH-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vH-act { display: flex; gap: 7px; margin-top: 11px; }
.vH-approve { padding: 5px 13px; border-radius: 7px; background: var(--warn); color: #1a1408; font-size: 12px; font-weight: 640; }
.vH-deny { padding: 5px 13px; border: 1px solid var(--line-2); border-radius: 7px; color: var(--ink-2); font-size: 12px; }
.vH-q { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; padding: 6px 12px; border: 1px dashed var(--line-2); border-radius: 8px; font-size: 12.5px; color: var(--ink-2); }
.vH-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vH-q button { color: var(--ink-3); font-size: 11px; }
.vH-q button:hover { color: var(--ink); }
.vH-composer { display: flex; align-items: flex-end; gap: 12px; padding: 12px 14px; border: 1px solid var(--line-2); border-radius: 11px; background: var(--bg-1); }
.vH-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 15px; }
.vH-composer textarea::placeholder { color: var(--ink-3); }
.vH-send { padding: 7px 17px; border-radius: 8px; background: var(--accent); color: var(--accent-ink); font-size: 13px; font-weight: 640; }
.vH-err { margin: 0 0 8px; font-size: 12.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");

  return (
    <div className="vH">
      <style>{css}</style>

      <header className="vH-rail">
        <div className="vH-mark">S</div>
        <div className="vH-seg"><span>Workspace</span><code>{scenario.workspace}</code></div>
        <div className="vH-seg"><span>Model</span><code>{scenario.model}</code></div>
        <div className="vH-seg"><span>Config</span><code>{scenario.configPath}</code></div>
        <div className="vH-spacer" />
        <span className={`vH-live ${scenario.running ? "on" : ""}`}><i />{scenario.running ? "Working" : "Idle"}</span>
        <button className="vH-abort" disabled={!scenario.running} onClick={() => noop("abort")}>Abort</button>
      </header>

      <div className={`vH-progress ${scenario.running ? "on" : ""}`} />

      <div className="vH-scroll">
        {scenario.messages.length === 0 ? (
          <div className="vH-empty">
            <div>
              <h2>All the chrome is up there</h2>
              <p>Everything below this line belongs to the conversation.</p>
            </div>
          </div>
        ) : (
          <div className="vH-thread">
            {scenario.messages.map((m, i) => (
              <div className="vH-turn" key={m.id}>
                <div className={`vH-who ${m.role === "user" ? "is-you" : ""}`}>
                  {m.role === "user" ? "You" : m.role === "tool" ? m.ts : "Smith"}
                </div>
                <div>
                  {m.role === "user" ? (
                    <div className="vH-ask">{m.content}</div>
                  ) : m.role === "tool" ? (
                    <div>
                      <div className={`vH-tool ${m.status === "running" ? "on" : ""}`}>
                        <b>{m.toolName}</b>
                        <span>{m.args}</span>
                      </div>
                      {m.result && <pre className="vH-tool-out">{m.result}</pre>}
                    </div>
                  ) : (
                    <div className="vH-say">
                      <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vH-foot">
        <div className="vH-foot-in">
          {pending.map((a) => (
            <div className="vH-approval" key={a.request.id}>
              <h4>{approvalTitle(a.request.kind)}</h4>
              {argLines(a.request.args).map(([k, v]) => (
                <div className="vH-arg" key={k}><b>{k}</b><span>{v}</span></div>
              ))}
              <div className="vH-act">
                <button className="vH-approve" onClick={() => noop("approve")}>Approve</button>
                <button className="vH-deny" onClick={() => noop("deny")}>Deny</button>
              </div>
            </div>
          ))}
          {scenario.queued.map((q) => (
            <div className="vH-q" key={q.id}>
              <p>{q.message}</p>
              <button onClick={() => noop("edit")}>Edit</button>
              <button onClick={() => noop("cancel")}>Cancel</button>
            </div>
          ))}
          {scenario.error && <p className="vH-err">{scenario.error}</p>}
          <div className="vH-composer">
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Smith to inspect or modify the workspace" />
            <button className="vH-send" onClick={() => noop("send")}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantH: Variant = {
  key: "H",
  name: "Top rail",
  note: "No left rail at all. Identity, config and status live in one 46px top bar; a hairline shows the run.",
  Component,
};
