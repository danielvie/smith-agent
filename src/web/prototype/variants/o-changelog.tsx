// PROTOTYPE variant O (gen 2: D x G x I). Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vO { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: #0c0e13; }
.vO-bar { display: flex; align-items: center; padding: 8px 20px; font-family: var(--mono); font-size: 11.5px; color: #4d5462; }
.vO-bar b { color: var(--ink-2); font-weight: 600; }
.vO-bar .s { margin: 0 8px; color: #262c38; }
.vO-bar .sp { margin-left: auto; }
.vO-bar .on { color: var(--warn); }
.vO-bar button { padding: 3px 10px; margin-left: 10px; color: #4d5462; font-family: var(--mono); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
.vO-bar button:hover:not(:disabled) { color: var(--ink-2); }

.vO-scroll { overflow-y: auto; }
.vO-list { max-width: 840px; margin: 0 auto; padding: 6px 28px 12px; }
.vO-entry { display: grid; grid-template-columns: 92px 1fr; gap: 20px; padding: 18px 0; border-top: 1px solid #191d26; }
.vO-entry:first-child { border-top: 0; }
.vO-entry.e-user { border-top-color: #232937; }
.vO-entry.e-ask { border-top-color: rgb(240 184 102 / 30%); border-bottom: 1px solid rgb(240 184 102 / 30%); }
.vO-mark { padding-top: 1px; font-family: var(--mono); font-size: 10.5px; line-height: 1.7; color: #3f4653; text-align: right; }
.vO-mark b { display: block; font-weight: 400; letter-spacing: .08em; text-transform: uppercase; color: #5f6779; }
.vO-entry.e-user .vO-mark b { color: var(--accent); }
.vO-entry.e-run .vO-mark b { color: #6f9f80; }
.vO-entry.e-live .vO-mark b { color: var(--warn); animation: p-pulse 1.2s ease-in-out infinite; }
.vO-entry.e-ask .vO-mark b { color: var(--warn); }
.vO-body { min-width: 0; }

.vO-ask { font-size: 16px; line-height: 1.5; color: #f2f5fa; }
.vO-say { font-size: 15.5px; line-height: 1.7; }
.vO-run { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vO-run em { font-style: normal; color: #5f6779; }
.vO-out { margin: 7px 0 0; font-family: var(--mono); font-size: 11px; line-height: 1.65; color: #59616f; white-space: pre-wrap; overflow-x: auto; }
.vO-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 4px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); }
.vO-arg b { font-weight: 400; color: #5f6779; }
.vO-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vO-act { display: flex; align-items: center; gap: 14px; margin-top: 13px; font-family: var(--mono); font-size: 12px; }
.vO-y { padding: 3px 13px; border-radius: 2px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vO-n { padding: 3px 13px; border: 1px solid #3a4152; border-radius: 2px; color: var(--ink-2); }
.vO-act em { font-style: normal; color: #5f6779; }
.vO-q { display: flex; align-items: baseline; gap: 14px; font-size: 13.5px; color: #7b8496; }
.vO-q p { flex: 1; margin: 0; }
.vO-q button { color: #5a6273; font-family: var(--mono); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
.vO-q button:hover { color: var(--ink); }

.vO-empty { display: grid; place-items: center; height: 100%; }
.vO-empty p { max-width: 400px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.8; color: #4d5462; }
.vO-empty span { color: #6f9f80; }

.vO-foot { border-top: 1px solid #191d26; }
.vO-foot-in { display: grid; grid-template-columns: 92px 1fr; gap: 20px; max-width: 840px; margin: 0 auto; padding: 14px 28px 18px; }
.vO-foot-mark { font-family: var(--mono); font-size: 10.5px; color: #3f4653; text-align: right; }
.vO-composer { display: flex; align-items: flex-start; gap: 12px; }
.vO-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 15px; line-height: 1.55; }
.vO-composer textarea::placeholder { color: #3f4653; }
.vO-send { padding: 5px 15px; border-radius: 3px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vO-err { margin: 0 0 9px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const empty = scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0;

  return (
    <div className="vO">
      <style>{css}</style>

      <header className="vO-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="s">·</span>
        {scenario.model}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vO-scroll">
        {empty ? (
          <div className="vO-empty">
            <p><span>ready</span><br />no fills, no cards — just rules and a hanging<br />timestamp for every entry.</p>
          </div>
        ) : (
          <div className="vO-list">
            {scenario.messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <div className="vO-entry e-user" key={m.id}>
                    <div className="vO-mark"><b>you</b>{m.ts}</div>
                    <div className="vO-body"><div className="vO-ask">{m.content}</div></div>
                  </div>
                );
              }
              if (m.role === "tool") {
                return (
                  <div className={`vO-entry e-run ${m.status === "running" ? "e-live" : ""}`} key={m.id}>
                    <div className="vO-mark"><b>{m.status === "running" ? "running" : "ran"}</b>{m.ts}</div>
                    <div className="vO-body">
                      <div className="vO-run"><strong>{m.toolName}</strong> <em>{m.args}</em></div>
                      {m.result && <pre className="vO-out">{m.result}</pre>}
                      {m.status === "running" && <pre className="vO-out">waiting…</pre>}
                    </div>
                  </div>
                );
              }
              return (
                <div className="vO-entry" key={m.id}>
                  <div className="vO-mark"><b>smith</b>{m.ts}</div>
                  <div className="vO-body">
                    <div className="vO-say">
                      <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                    </div>
                  </div>
                </div>
              );
            })}

            {pending.map((a) => (
              <div className="vO-entry e-ask" key={a.request.id}>
                <div className="vO-mark"><b>permission</b>now</div>
                <div className="vO-body">
                  <div className="vO-run">{approvalTitle(a.request.kind)} — <em>{a.request.toolName}</em></div>
                  {argLines(a.request.args).map(([k, v]) => (
                    <div className="vO-arg" key={k}><b>{k}</b><span>{v}</span></div>
                  ))}
                  <div className="vO-act">
                    <button className="vO-y" onClick={() => noop("approve")}>y — approve</button>
                    <button className="vO-n" onClick={() => noop("deny")}>n — deny</button>
                    <em>the run is parked here</em>
                  </div>
                </div>
              </div>
            ))}

            {scenario.queued.map((q, i) => (
              <div className="vO-entry" key={q.id}>
                <div className="vO-mark"><b>queued</b>{i + 1}/{scenario.queued.length}</div>
                <div className="vO-body">
                  <div className="vO-q">
                    <p>{q.message}</p>
                    <button onClick={() => noop("edit")}>edit</button>
                    <button onClick={() => noop("cancel")}>cancel</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vO-foot">
        <div className="vO-foot-in">
          <div className="vO-foot-mark">{scenario.running ? "queues" : "next"}</div>
          <div>
            {scenario.error && <p className="vO-err">! {scenario.error}</p>}
            <div className="vO-composer">
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="ask smith…" />
              <button className="vO-send" onClick={() => noop("send")}>send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantO: Variant = {
  key: "O",
  name: "Changelog rules",
  note: "No fills at all. Hairline rules replace the spine; timestamps and kind hang in a left margin.",
  Component,
};
