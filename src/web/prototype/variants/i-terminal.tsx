// PROTOTYPE variant I. Throwaway.
import { Md } from "../md";
import { argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vI { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: #0b0d12; font-family: var(--mono); }
.vI-bar { display: flex; align-items: center; gap: 0; padding: 6px 14px; border-bottom: 1px solid var(--line); background: #0e1016; font-size: 11.5px; color: var(--ink-3); }
.vI-bar b { color: var(--accent); font-weight: 600; }
.vI-bar .vI-sep { margin: 0 8px; color: var(--line-2); }
.vI-bar .vI-spacer { margin-left: auto; }
.vI-bar .on { color: var(--warn); }

.vI-scroll { overflow-y: auto; padding: 14px 0 6px; }
.vI-log { max-width: 1000px; margin: 0 auto; padding: 0 16px; font-size: 12.5px; line-height: 1.62; }
.vI-line { display: grid; grid-template-columns: 46px 14px 1fr; gap: 8px; padding: 1px 0; }
.vI-ts { color: #3f4653; font-size: 11px; }
.vI-sig { color: var(--ink-3); }
.vI-line.l-user .vI-sig { color: var(--accent); }
.vI-line.l-user .vI-text { color: #f4f6fb; }
.vI-line.l-run .vI-sig { color: var(--ok); }
.vI-line.l-run .vI-text { color: var(--ink-2); }
.vI-line.l-live .vI-sig { color: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vI-line.l-live .vI-text { color: var(--warn); }
.vI-line.l-err .vI-sig, .vI-line.l-err .vI-text { color: var(--danger); }
.vI-text { min-width: 0; overflow-wrap: anywhere; }
.vI-out { margin: 2px 0 6px; padding-left: 14px; border-left: 1px solid #1c2029; color: #6b7383; font-size: 11.5px; white-space: pre-wrap; }
.vI-say { padding: 6px 0 10px 68px; font-family: var(--sans); font-size: 14.5px; line-height: 1.62; }
.vI-say .p-md pre { background: #070910; }

.vI-prompt { margin-top: 6px; padding: 10px 12px; border: 1px solid rgb(240 184 102 / 45%); border-radius: 4px; background: rgb(240 184 102 / 5%); }
.vI-prompt-h { color: var(--warn); font-size: 12.5px; }
.vI-prompt-arg { display: grid; grid-template-columns: 62px 1fr; gap: 8px; margin-top: 3px; font-size: 11.5px; color: var(--ink-2); }
.vI-prompt-arg b { font-weight: 400; color: var(--ink-3); }
.vI-prompt-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vI-prompt-act { display: flex; align-items: center; gap: 10px; margin-top: 10px; font-size: 12px; }
.vI-y { padding: 3px 12px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vI-n { padding: 3px 12px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vI-prompt-act em { font-style: normal; color: var(--ink-3); }

.vI-empty { padding: 0 16px; max-width: 1000px; margin: 0 auto; color: var(--ink-3); font-size: 12.5px; }
.vI-empty span { color: var(--ok); }

.vI-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vI-foot-in { max-width: 1000px; margin: 0 auto; padding: 8px 16px 12px; }
.vI-qhead { margin: 0 0 3px; font-size: 11px; color: var(--ink-3); }
.vI-q { display: flex; align-items: center; gap: 9px; padding: 2px 0; font-size: 12px; color: #7b8496; }
.vI-q i { font-style: normal; color: #3f4653; }
.vI-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vI-q button { color: #5a6273; font-size: 11px; }
.vI-q button:hover { color: var(--ink); }
.vI-input-row { display: flex; align-items: flex-start; gap: 9px; margin-top: 8px; }
.vI-caret { padding-top: 2px; color: var(--accent); font-size: 13px; }
.vI-input-row textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-family: var(--mono); font-size: 13px; line-height: 1.5; color: var(--ink); }
.vI-input-row textarea::placeholder { color: #454c5a; }
.vI-send { padding: 4px 13px; border-radius: 3px; background: var(--accent); color: var(--accent-ink); font-size: 12px; font-weight: 700; }
.vI-err { margin: 6px 0 0; font-size: 11.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");

  return (
    <div className="vI">
      <style>{css}</style>

      <header className="vI-bar">
        <b>smith</b>
        <span className="vI-sep">·</span>
        {scenario.workspace}
        <span className="vI-sep">·</span>
        {scenario.model}
        <span className="vI-spacer" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "run: active" : "run: idle"}</span>
      </header>

      <div className="vI-scroll">
        <div className="vI-log">
          {scenario.messages.length === 0 && (
            <div className="vI-empty">
              <span>ready</span> — workspace opened, {scenario.messages.length} turns in this session. Type below.
            </div>
          )}

          {scenario.messages.map((m, i) => {
            if (m.role === "user") {
              return (
                <div className="vI-line l-user" key={m.id}>
                  <span className="vI-ts">{m.ts}</span>
                  <span className="vI-sig">›</span>
                  <span className="vI-text">{m.content}</span>
                </div>
              );
            }
            if (m.role === "tool") {
              return (
                <div key={m.id}>
                  <div className={`vI-line ${m.status === "running" ? "l-live" : "l-run"}`}>
                    <span className="vI-ts">{m.ts}</span>
                    <span className="vI-sig">{m.status === "running" ? "◐" : "✓"}</span>
                    <span className="vI-text">
                      {m.toolName} {m.args}
                    </span>
                  </div>
                  {m.result && <pre className="vI-out">{m.result}</pre>}
                  {m.status === "running" && <pre className="vI-out">waiting…</pre>}
                </div>
              );
            }
            return (
              <div className="vI-say" key={m.id}>
                <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
              </div>
            );
          })}

          {pending.map((a) => (
            <div className="vI-prompt" key={a.request.id}>
              <div className="vI-prompt-h">
                ? {a.request.kind === "shell" ? "run command" : "write file"} — {a.request.toolName}
              </div>
              {argLines(a.request.args).map(([k, v]) => (
                <div className="vI-prompt-arg" key={k}><b>{k}</b><span>{v}</span></div>
              ))}
              <div className="vI-prompt-act">
                <button className="vI-y" onClick={() => noop("approve")}>y — approve</button>
                <button className="vI-n" onClick={() => noop("deny")}>n — deny</button>
                <em>run is parked until you answer</em>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="vI-foot">
        <div className="vI-foot-in">
          {scenario.queued.length > 0 && (
            <>
              <p className="vI-qhead">queue ({scenario.queued.length}) — runs in order after the current turn</p>
              {scenario.queued.map((q, i) => (
                <div className="vI-q" key={q.id}>
                  <i>{i + 1}.</i>
                  <p>{q.message}</p>
                  <button onClick={() => noop("edit")}>edit</button>
                  <button onClick={() => noop("cancel")}>rm</button>
                </div>
              ))}
            </>
          )}
          {scenario.error && <p className="vI-err">! {scenario.error}</p>}
          <div className="vI-input-row">
            <span className="vI-caret">›</span>
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
            <button className="vI-send" onClick={() => noop("send")}>send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantI: Variant = {
  key: "I",
  name: "Terminal",
  note: "Monospace log. Approvals block inline like a REPL y/n prompt, in the stream where they happened.",
  Component,
};
