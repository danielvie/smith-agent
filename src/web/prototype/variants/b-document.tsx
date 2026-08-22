// PROTOTYPE variant B. Throwaway.
import { useState } from "react";
import { Md } from "../md";
import { approvalTitle, argLines, shortPath, type Variant, type VariantProps } from "../kit";

const css = `
.vB { position: relative; height: 100%; background: var(--bg); }
.vB-scroll { height: 100%; overflow-y: auto; padding: 72px 24px 220px; }
.vB-doc { display: flex; flex-direction: column; gap: 40px; max-width: 680px; margin: 0 auto; }
.vB-turn { display: grid; grid-template-columns: 1fr; gap: 10px; }
.vB-ask { font-size: 19px; font-weight: 500; line-height: 1.45; color: #f4f6fb; }
.vB-ask::before { content: ""; display: block; width: 26px; height: 2px; margin-bottom: 14px; background: var(--accent); }
.vB-say { font-size: 15.5px; line-height: 1.68; color: var(--ink); }
.vB-runs { display: flex; flex-wrap: wrap; gap: 6px; }
.vB-run { display: inline-flex; align-items: center; gap: 7px; padding: 3px 9px 3px 7px; border: 1px solid var(--line); border-radius: 999px; font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
.vB-run b { font-weight: 500; color: var(--ink-2); }
.vB-run.is-running { border-color: rgb(240 184 102 / 45%); color: var(--warn); }
.vB-run i { width: 4px; height: 4px; border-radius: 999px; background: currentColor; }
.vB-run.is-running i { animation: p-pulse 1.2s ease-in-out infinite; }

.vB-chip { position: fixed; top: 18px; left: 18px; z-index: 5; display: flex; align-items: center; gap: 9px; padding: 6px 12px 6px 7px; border: 1px solid var(--line); border-radius: 999px; background: rgb(23 26 34 / 82%); backdrop-filter: blur(8px); font-size: 12px; color: var(--ink-2); }
.vB-chip i { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 6px; background: var(--accent); color: var(--accent-ink); font-size: 11px; font-weight: 700; font-style: normal; }
.vB-chip.is-running { border-color: rgb(240 184 102 / 40%); color: var(--warn); }

.vB-sheet { position: fixed; inset: 0; z-index: 20; display: grid; place-items: start center; padding-top: 14vh; background: rgb(8 9 13 / 62%); }
.vB-sheet-card { width: min(440px, 92vw); padding: 20px 22px; border: 1px solid var(--line-2); border-radius: 14px; background: var(--bg-1); }
.vB-sheet-card h3 { margin: 0 0 14px; font-size: 14px; font-weight: 620; }
.vB-sheet-row { display: grid; grid-template-columns: 74px 1fr; gap: 12px; padding: 7px 0; border-top: 1px solid var(--line); font-size: 12.5px; }
.vB-sheet-row span { color: var(--ink-3); }
.vB-sheet-row code { font-family: var(--mono); font-size: 11.5px; overflow-wrap: anywhere; }
.vB-sheet-card button { margin-top: 16px; padding: 6px 14px; border: 1px solid var(--line-2); border-radius: 7px; color: var(--ink-2); font-size: 12.5px; }

.vB-dock { position: fixed; left: 50%; bottom: 26px; z-index: 8; width: min(680px, calc(100vw - 48px)); transform: translateX(-50%); }
.vB-approval { margin-bottom: 9px; padding: 15px 17px; border: 1px solid rgb(240 184 102 / 40%); border-radius: 14px; background: rgb(28 24 16 / 96%); box-shadow: 0 14px 40px rgb(0 0 0 / 45%); }
.vB-approval h4 { margin: 0 0 10px; font-size: 13px; font-weight: 620; color: var(--warn); }
.vB-arg { display: flex; gap: 9px; margin-bottom: 4px; font-family: var(--mono); font-size: 11.5px; }
.vB-arg b { flex: 0 0 60px; font-weight: 500; color: var(--ink-3); }
.vB-arg span { color: var(--ink); overflow-wrap: anywhere; white-space: pre-wrap; }
.vB-approval-act { display: flex; gap: 8px; margin-top: 13px; }
.vB-approve { padding: 6px 15px; border-radius: 8px; background: var(--warn); color: #1a1408; font-size: 12.5px; font-weight: 640; }
.vB-deny { padding: 6px 15px; border: 1px solid var(--line-2); border-radius: 8px; color: var(--ink-2); font-size: 12.5px; }

.vB-queue { display: flex; flex-direction: column; gap: 4px; margin-bottom: 7px; }
.vB-q { display: flex; align-items: center; gap: 9px; padding: 6px 13px; border-radius: 999px; background: rgb(29 33 43 / 94%); font-size: 12px; color: var(--ink-2); }
.vB-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vB-q i { width: 5px; height: 5px; border-radius: 999px; background: var(--ink-3); }
.vB-q button { color: var(--ink-3); font-size: 11px; }
.vB-q button:hover { color: var(--ink); }

.vB-island { padding: 14px 16px; border: 1px solid var(--line-2); border-radius: 16px; background: rgb(23 26 34 / 96%); backdrop-filter: blur(10px); box-shadow: 0 18px 50px rgb(0 0 0 / 50%); }
.vB-island textarea { width: 100%; border: 0; background: none; outline: none; resize: none; font-size: 15px; }
.vB-island textarea::placeholder { color: var(--ink-3); }
.vB-island-act { display: flex; align-items: center; justify-content: space-between; margin-top: 9px; }
.vB-hint { font-size: 11.5px; color: var(--ink-3); }
.vB-send { padding: 7px 17px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: 13px; font-weight: 640; }
.vB-err { margin: 0 0 7px; padding: 6px 13px; border-radius: 999px; background: rgb(240 138 138 / 12%); font-size: 12px; color: var(--danger); }

.vB-empty { display: grid; place-items: center; height: calc(100vh - 300px); text-align: center; }
.vB-empty h2 { margin: 0 0 8px; font-size: 22px; font-weight: 500; color: var(--ink-2); }
.vB-empty p { margin: 0; font-size: 13.5px; color: var(--ink-3); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const [sheet, setSheet] = useState(false);
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const tools = scenario.messages.filter((m) => m.role === "tool");
  const turns = scenario.messages.filter((m) => m.role !== "tool");

  return (
    <div className="vB">
      <style>{css}</style>

      <button className={`vB-chip ${scenario.running ? "is-running" : ""}`} onClick={() => setSheet(true)}>
        <i>S</i>
        {shortPath(scenario.workspace)}
        {scenario.running && " · working"}
      </button>

      {sheet && (
        <div className="vB-sheet" onClick={() => setSheet(false)}>
          <div className="vB-sheet-card" onClick={(e) => e.stopPropagation()}>
            <h3>Session</h3>
            <div className="vB-sheet-row"><span>Workspace</span><code>{scenario.workspace}</code></div>
            <div className="vB-sheet-row"><span>Model</span><code>{scenario.model}</code></div>
            <div className="vB-sheet-row"><span>Config</span><code>{scenario.configPath}</code></div>
            <div className="vB-sheet-row"><span>State</span><code>{scenario.running ? "running" : "idle"}</code></div>
            <button onClick={() => setSheet(false)}>Close</button>
          </div>
        </div>
      )}

      <div className="vB-scroll">
        {scenario.messages.length === 0 ? (
          <div className="vB-empty">
            <h2>What should Smith look at?</h2>
            <p>It can read this workspace, explain what it finds, and change it with your approval.</p>
          </div>
        ) : (
          <div className="vB-doc">
            {turns.map((m, i) => (
              <div className="vB-turn" key={m.id}>
                {m.role === "user" ? (
                  <div className="vB-ask">{m.content}</div>
                ) : (
                  <>
                    {i === turns.length - 1 && tools.length > 0 && (
                      <div className="vB-runs">
                        {tools.map((t) => (
                          <span className={`vB-run ${t.status === "running" ? "is-running" : ""}`} key={t.id}>
                            <i />
                            <b>{t.toolName}</b>
                            {t.status === "running" ? "running" : (t.result?.split("\n")[0] ?? "done")}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="vB-say">
                      <Md source={m.content} className={scenario.streamingTail && i === turns.length - 1 ? "p-caret" : ""} />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vB-dock">
        {pending.map((a) => (
          <div className="vB-approval" key={a.request.id}>
            <h4>{approvalTitle(a.request.kind)}</h4>
            {argLines(a.request.args).map(([k, v]) => (
              <div className="vB-arg" key={k}><b>{k}</b><span>{v}</span></div>
            ))}
            <div className="vB-approval-act">
              <button className="vB-approve" onClick={() => noop("approve")}>Approve</button>
              <button className="vB-deny" onClick={() => noop("deny")}>Deny</button>
            </div>
          </div>
        ))}

        {scenario.queued.length > 0 && (
          <div className="vB-queue">
            {scenario.queued.map((q) => (
              <div className="vB-q" key={q.id}>
                <i />
                <p>{q.message}</p>
                <button onClick={() => noop("edit")}>Edit</button>
                <button onClick={() => noop("cancel")}>Cancel</button>
              </div>
            ))}
          </div>
        )}

        {scenario.error && <p className="vB-err">{scenario.error}</p>}

        <div className="vB-island">
          <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask Smith something" />
          <div className="vB-island-act">
            <span className="vB-hint">{scenario.running ? "Queues behind the current run" : "Enter to send"}</span>
            <button className="vB-send" onClick={() => noop("send")}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantB: Variant = {
  key: "B",
  name: "Centered document",
  note: "No rail. Identity is a chip that opens a sheet. Composer floats as an island.",
  Component,
};
