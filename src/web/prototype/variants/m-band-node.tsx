// PROTOTYPE variant M (gen 2: D x G x I). Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vM { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: #0a0c11; }
.vM-bar { display: flex; align-items: center; padding: 7px 18px; border-bottom: 1px solid var(--line); background: #0e1016; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vM-bar b { color: var(--accent); font-weight: 600; }
.vM-bar .s { margin: 0 8px; color: var(--line-2); }
.vM-bar .sp { margin-left: auto; }
.vM-bar .on { color: var(--warn); }
.vM-bar button { padding: 3px 10px; margin-left: 10px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-family: var(--mono); font-size: 11px; }

.vM-scroll { overflow-y: auto; padding: 18px 0 10px; }
.vM-stack { position: relative; max-width: 900px; margin: 0 auto; padding: 0 24px; }
.vM-node { position: relative; margin-bottom: 8px; }
.vM-node::before { content: ""; position: absolute; left: 39px; top: -8px; height: 8px; width: 1px; background: var(--line-2); }
.vM-node:first-child::before { display: none; }
.vM-band { position: relative; padding: 15px 20px 15px 62px; border: 1px solid transparent; border-radius: 4px; background: #12151d; }
.vM-node.n-user .vM-band { background: #171b25; border-color: #232937; }
.vM-node.n-run .vM-band { background: #0d1016; }
.vM-node.n-ask .vM-band { background: #1a1610; border-color: rgb(240 184 102 / 34%); }
.vM-node.n-queue .vM-band { background: #0d1016; border-style: dashed; border-color: #232937; }
.vM-sig { position: absolute; top: 14px; left: 14px; display: grid; place-items: center; width: 26px; height: 22px; border-radius: 3px; background: #0a0c11; font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
.vM-node.n-user .vM-sig { color: var(--accent); }
.vM-node.n-run .vM-sig { color: var(--ok); }
.vM-node.n-live .vM-sig { color: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vM-node.n-ask .vM-sig { color: var(--warn); }

.vM-meta { display: flex; align-items: baseline; gap: 10px; margin-bottom: 7px; font-family: var(--mono); font-size: 10.5px; color: #4d5462; }
.vM-meta b { font-weight: 400; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); }
.vM-node.n-user .vM-meta b { color: var(--accent); }
.vM-node.n-ask .vM-meta b { color: var(--warn); }
.vM-ask { font-size: 15.5px; line-height: 1.5; color: #f4f6fb; }
.vM-say { font-size: 15px; line-height: 1.66; }
.vM-run { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vM-run em { font-style: normal; color: var(--ink-3); }
.vM-out { margin: 7px 0 0; padding: 8px 11px; border-radius: 3px; background: #07090d; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #6b7383; white-space: pre-wrap; overflow-x: auto; }
.vM-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 3px; font-family: var(--mono); font-size: 11.5px; }
.vM-arg b { font-weight: 400; color: var(--ink-3); }
.vM-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vM-act { display: flex; align-items: center; gap: 9px; margin-top: 12px; font-family: var(--mono); font-size: 12px; }
.vM-y { padding: 3px 13px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vM-n { padding: 3px 13px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vM-act em { font-style: normal; color: var(--ink-3); }
.vM-q { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 12px; color: #7b8496; }
.vM-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vM-q button { color: #5a6273; font-size: 11px; }
.vM-q button:hover { color: var(--ink); }

.vM-empty { display: grid; place-items: center; height: 100%; }
.vM-empty p { max-width: 400px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.7; color: var(--ink-3); }
.vM-empty span { color: var(--ok); }

.vM-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vM-foot-in { max-width: 900px; margin: 0 auto; padding: 11px 24px 15px; }
.vM-composer { display: flex; align-items: flex-start; gap: 10px; padding-left: 48px; }
.vM-caret { padding-top: 3px; margin-left: -34px; color: var(--accent); font-family: var(--mono); font-size: 13px; }
.vM-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; line-height: 1.5; }
.vM-composer textarea::placeholder { color: #454c5a; }
.vM-send { padding: 5px 15px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vM-err { margin: 0 0 8px; padding-left: 62px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const empty = scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0;

  return (
    <div className="vM">
      <style>{css}</style>

      <header className="vM-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="s">·</span>
        {scenario.model}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vM-scroll">
        {empty ? (
          <div className="vM-empty">
            <p><span>ready</span> — each event is its own block on the chain.<br />Nothing shares a card with anything else.</p>
          </div>
        ) : (
          <div className="vM-stack">
            {scenario.messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <div className="vM-node n-user" key={m.id}>
                    <div className="vM-band">
                      <span className="vM-sig">›</span>
                      <div className="vM-meta"><b>you</b>{m.ts}</div>
                      <div className="vM-ask">{m.content}</div>
                    </div>
                  </div>
                );
              }
              if (m.role === "tool") {
                return (
                  <div className={`vM-node n-run ${m.status === "running" ? "n-live" : ""}`} key={m.id}>
                    <div className="vM-band">
                      <span className="vM-sig">{m.status === "running" ? "◐" : "✓"}</span>
                      <div className="vM-meta"><b>{m.status === "running" ? "running" : "ran"}</b>{m.ts}</div>
                      <div className="vM-run"><strong>{m.toolName}</strong> <em>{m.args}</em></div>
                      {m.result && <pre className="vM-out">{m.result}</pre>}
                      {m.status === "running" && <pre className="vM-out">waiting…</pre>}
                    </div>
                  </div>
                );
              }
              return (
                <div className="vM-node" key={m.id}>
                  <div className="vM-band">
                    <span className="vM-sig">·</span>
                    <div className="vM-meta"><b>smith</b>{m.ts}</div>
                    <div className="vM-say">
                      <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                    </div>
                  </div>
                </div>
              );
            })}

            {pending.map((a) => (
              <div className="vM-node n-ask" key={a.request.id}>
                <div className="vM-band">
                  <span className="vM-sig">?</span>
                  <div className="vM-meta"><b>waiting on you</b>now</div>
                  <div className="vM-run">{approvalTitle(a.request.kind)} — <em>{a.request.toolName}</em></div>
                  {argLines(a.request.args).map(([k, v]) => (
                    <div className="vM-arg" key={k}><b>{k}</b><span>{v}</span></div>
                  ))}
                  <div className="vM-act">
                    <button className="vM-y" onClick={() => noop("approve")}>y — approve</button>
                    <button className="vM-n" onClick={() => noop("deny")}>n — deny</button>
                    <em>run parked</em>
                  </div>
                </div>
              </div>
            ))}

            {scenario.queued.map((q, i) => (
              <div className="vM-node n-queue" key={q.id}>
                <div className="vM-band">
                  <span className="vM-sig">»</span>
                  <div className="vM-meta"><b>queued</b>{i + 1} of {scenario.queued.length}</div>
                  <div className="vM-q">
                    <p>{q.message}</p>
                    <button onClick={() => noop("edit")}>edit</button>
                    <button onClick={() => noop("cancel")}>rm</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="vM-foot">
        <div className="vM-foot-in">
          {scenario.error && <p className="vM-err">! {scenario.error}</p>}
          <div className="vM-composer">
            <span className="vM-caret">›</span>
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
            <button className="vM-send" onClick={() => noop("send")}>send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantM: Variant = {
  key: "M",
  name: "Band as node",
  note: "Every event is its own bordered block, chained by short spine segments. Sigil sits in the block's gutter.",
  Component,
};
