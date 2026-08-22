// PROTOTYPE variant J. Throwaway.
import { useEffect, useState } from "react";
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vJ { position: relative; height: 100%; background: var(--bg); }
.vJ-hair { position: fixed; top: 0; left: 0; right: 0; height: 2px; z-index: 6; background: transparent; }
.vJ-hair.on { background: linear-gradient(90deg, transparent, var(--warn), transparent); background-size: 35% 100%; background-repeat: no-repeat; animation: vJ-run 1.7s linear infinite; }
@keyframes vJ-run { from { background-position: -35% 0; } to { background-position: 135% 0; } }

.vJ-scroll { height: 100%; overflow-y: auto; padding: 56px 24px 190px; }
.vJ-thread { display: flex; flex-direction: column; gap: 34px; max-width: 640px; margin: 0 auto; }
.vJ-ask { position: relative; padding-left: 18px; font-size: 16px; line-height: 1.5; color: #f4f6fb; }
.vJ-ask::before { content: ""; position: absolute; top: 5px; bottom: 5px; left: 0; width: 2px; background: var(--accent); border-radius: 2px; }
.vJ-say { font-size: 15.5px; line-height: 1.7; }
.vJ-runs { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--ink-3); }
.vJ-runs b { font-family: var(--mono); font-weight: 500; color: var(--ink-2); }
.vJ-runs .on { color: var(--warn); }
.vJ-runs button { color: var(--ink-3); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
.vJ-runs button:hover { color: var(--ink); }
.vJ-runs-open { margin: 6px 0 0; padding: 8px 11px; border-radius: 7px; background: var(--bg-1); font-family: var(--mono); font-size: 11px; color: var(--ink-3); white-space: pre-wrap; overflow-x: auto; }

.vJ-empty { display: grid; place-items: center; height: calc(100vh - 260px); text-align: center; }
.vJ-empty h2 { margin: 0 0 10px; font-size: 24px; font-weight: 400; letter-spacing: -.015em; color: var(--ink-2); }
.vJ-empty p { margin: 0; font-size: 13px; color: var(--ink-3); }
.vJ-empty kbd { padding: 1px 6px; border: 1px solid var(--line-2); border-radius: 4px; font-family: var(--mono); font-size: 11px; color: var(--ink-2); }

.vJ-dock { position: fixed; left: 50%; bottom: 24px; z-index: 5; width: min(640px, calc(100vw - 40px)); transform: translateX(-50%); }
.vJ-pill { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 9px; padding: 5px 13px; border-radius: 999px; background: var(--bg-2); font-size: 11.5px; color: var(--ink-3); }
.vJ-pill.on { background: rgb(240 184 102 / 13%); color: var(--warn); }
.vJ-pill i { width: 5px; height: 5px; border-radius: 999px; background: currentColor; }
.vJ-pill.on i { animation: p-pulse 1.2s ease-in-out infinite; }

.vJ-approval { margin-bottom: 9px; padding: 15px 17px; border: 1px solid rgb(240 184 102 / 42%); border-radius: 13px; background: #191510; box-shadow: 0 16px 44px rgb(0 0 0 / 50%); }
.vJ-approval h4 { margin: 0 0 9px; font-size: 13.5px; font-weight: 620; color: var(--warn); }
.vJ-arg { display: flex; gap: 9px; margin-bottom: 4px; font-family: var(--mono); font-size: 11.5px; }
.vJ-arg b { flex: 0 0 60px; font-weight: 500; color: var(--ink-3); }
.vJ-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vJ-act { display: flex; gap: 8px; margin-top: 12px; }
.vJ-approve { padding: 6px 15px; border-radius: 8px; background: var(--warn); color: #1a1408; font-size: 12.5px; font-weight: 640; }
.vJ-deny { padding: 6px 15px; border: 1px solid var(--line-2); border-radius: 8px; color: var(--ink-2); font-size: 12.5px; }

.vJ-q { display: flex; align-items: center; gap: 9px; margin-bottom: 4px; padding: 6px 14px; border-radius: 10px; background: var(--bg-1); font-size: 12px; color: var(--ink-3); }
.vJ-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vJ-q button { color: var(--ink-3); font-size: 11px; }
.vJ-q button:hover { color: var(--ink); }

.vJ-composer { padding: 13px 15px; border: 1px solid var(--line); border-radius: 14px; background: rgb(19 22 29 / 97%); backdrop-filter: blur(10px); }
.vJ-composer:focus-within { border-color: var(--line-2); }
.vJ-composer textarea { width: 100%; border: 0; background: none; outline: none; resize: none; font-size: 15px; }
.vJ-composer textarea::placeholder { color: var(--ink-3); }
.vJ-row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.vJ-hint { font-size: 11px; color: var(--ink-3); }
.vJ-send { padding: 6px 16px; border-radius: 9px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vJ-err { margin: 0 0 8px; padding: 6px 14px; border-radius: 10px; background: rgb(240 138 138 / 10%); font-size: 12px; color: var(--danger); }

.vJ-overlay { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: rgb(8 9 13 / 70%); }
.vJ-overlay-card { width: min(420px, 92vw); padding: 20px 22px; border: 1px solid var(--line-2); border-radius: 14px; background: var(--bg-1); }
.vJ-overlay-card h3 { margin: 0 0 12px; font-size: 13.5px; font-weight: 620; }
.vJ-overlay-row { display: grid; grid-template-columns: 76px 1fr; gap: 12px; padding: 7px 0; border-top: 1px solid var(--line); font-size: 12.5px; }
.vJ-overlay-row span { color: var(--ink-3); }
.vJ-overlay-row code { font-family: var(--mono); font-size: 11.5px; overflow-wrap: anywhere; }
.vJ-overlay-card p { margin: 14px 0 0; font-size: 11.5px; color: var(--ink-3); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const [overlay, setOverlay] = useState(false);
  const [openRuns, setOpenRuns] = useState(false);
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const tools = scenario.messages.filter((m) => m.role === "tool");
  const turns = scenario.messages.filter((m) => m.role !== "tool");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/u.test(target.tagName)) return;
      if (event.key.toLowerCase() === "i") setOverlay((value) => !value);
      if (event.key === "Escape") setOverlay(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="vJ">
      <style>{css}</style>
      <div className={`vJ-hair ${scenario.running ? "on" : ""}`} />

      {overlay && (
        <div className="vJ-overlay" onClick={() => setOverlay(false)}>
          <div className="vJ-overlay-card" onClick={(e) => e.stopPropagation()}>
            <h3>Session</h3>
            <div className="vJ-overlay-row"><span>Workspace</span><code>{scenario.workspace}</code></div>
            <div className="vJ-overlay-row"><span>Model</span><code>{scenario.model}</code></div>
            <div className="vJ-overlay-row"><span>Config</span><code>{scenario.configPath}</code></div>
            <div className="vJ-overlay-row"><span>State</span><code>{scenario.running ? "running" : "idle"}</code></div>
            <p>Press I or Escape to dismiss.</p>
          </div>
        </div>
      )}

      <div className="vJ-scroll">
        {scenario.messages.length === 0 ? (
          <div className="vJ-empty">
            <div>
              <h2>Smith is listening</h2>
              <p>Press <kbd>I</kbd> for session details. Everything else stays out of the way.</p>
            </div>
          </div>
        ) : (
          <div className="vJ-thread">
            {turns.map((m, i) => (
              <div key={m.id}>
                {m.role === "user" ? (
                  <div className="vJ-ask">{m.content}</div>
                ) : (
                  <>
                    {i === turns.length - 1 && tools.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <div className="vJ-runs">
                          <b className={tools.some((t) => t.status === "running") ? "on" : ""}>
                            {tools.length} run{tools.length === 1 ? "" : "s"}
                          </b>
                          <span>{tools.map((t) => t.toolName).join(", ")}</span>
                          <button onClick={() => setOpenRuns(!openRuns)}>{openRuns ? "hide" : "show"}</button>
                        </div>
                        {openRuns && (
                          <pre className="vJ-runs-open">
                            {tools.map((t) => `${t.toolName} ${t.args}\n${t.status === "running" ? "  running…" : `  ${t.result?.split("\n")[0] ?? ""}`}`).join("\n")}
                          </pre>
                        )}
                      </div>
                    )}
                    <div className="vJ-say">
                      <Md source={m.content} className={scenario.streamingTail && i === turns.length - 1 ? "p-caret" : ""} />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vJ-dock">
        {(scenario.running || pending.length > 0) && (
          <span className={`vJ-pill ${scenario.running ? "on" : ""}`}>
            <i />
            {pending.length > 0 ? "paused — waiting on you" : "working"}
          </span>
        )}

        {pending.map((a) => (
          <div className="vJ-approval" key={a.request.id}>
            <h4>{approvalTitle(a.request.kind)}</h4>
            {argLines(a.request.args).map(([k, v]) => (
              <div className="vJ-arg" key={k}><b>{k}</b><span>{v}</span></div>
            ))}
            <div className="vJ-act">
              <button className="vJ-approve" onClick={() => noop("approve")}>Approve</button>
              <button className="vJ-deny" onClick={() => noop("deny")}>Deny</button>
            </div>
          </div>
        ))}

        {scenario.queued.map((q) => (
          <div className="vJ-q" key={q.id}>
            <p>{q.message}</p>
            <button onClick={() => noop("edit")}>Edit</button>
            <button onClick={() => noop("cancel")}>Cancel</button>
          </div>
        ))}

        {scenario.error && <p className="vJ-err">{scenario.error}</p>}

        <div className="vJ-composer">
          <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Smith something" />
          <div className="vJ-row">
            <span className="vJ-hint">{scenario.queued.length > 0 ? `${scenario.queued.length} waiting` : scenario.running ? "will queue" : "Enter to send"}</span>
            <button className="vJ-send" onClick={() => noop("send")}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantJ: Variant = {
  key: "J",
  name: "Focus mode",
  note: "Status is a hairline plus one pill. Session details are a keyboard-summoned overlay (press I).",
  Component,
};
