// PROTOTYPE variant K (gen 2: D x G x I). Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vK { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: var(--bg); }
.vK-bar { display: flex; align-items: center; gap: 0; padding: 7px 16px; border-bottom: 1px solid var(--line); background: #0e1016; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vK-bar b { color: var(--accent); font-weight: 600; }
.vK-bar .s { margin: 0 8px; color: var(--line-2); }
.vK-bar .sp { margin-left: auto; }
.vK-bar .on { color: var(--warn); }
.vK-bar button { padding: 3px 10px; margin-left: 10px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-family: var(--mono); font-size: 11px; }

.vK-scroll { overflow-y: auto; }
.vK-band { --ring: var(--bg); }
.vK-band.b-user { background: #14171f; --ring: #14171f; }
.vK-band.b-run { background: #0d0f15; --ring: #0d0f15; }
.vK-band.b-ask { background: #191510; --ring: #191510; }
.vK-band.b-queue { background: #0d0f15; --ring: #0d0f15; }
.vK-in { position: relative; max-width: 880px; margin: 0 auto; padding: 16px 28px 16px 84px; }
.vK-in::before { content: ""; position: absolute; top: 0; bottom: 0; left: 55px; width: 1px; background: var(--line); }
.vK-in::after { content: ""; position: absolute; top: 22px; left: 51px; width: 9px; height: 9px; border-radius: 999px; background: var(--ink-3); box-shadow: 0 0 0 4px var(--ring); }
.vK-band.b-user .vK-in::after { background: var(--accent); }
.vK-band.b-run .vK-in::after { background: var(--ok); }
.vK-band.b-live .vK-in::after { background: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vK-band.b-ask .vK-in::after { background: var(--warn); }
.vK-band.b-queue .vK-in::after { background: none; box-shadow: 0 0 0 4px var(--ring), inset 0 0 0 1px var(--line-2); }
.vK-band:first-child .vK-in::before { top: 22px; }
.vK-band:last-of-type .vK-in::before { bottom: auto; height: 22px; }

.vK-ts { position: absolute; top: 18px; left: 0; width: 42px; text-align: right; font-family: var(--mono); font-size: 10.5px; color: #454c5a; }
.vK-kind { margin-bottom: 6px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; color: var(--ink-3); }
.vK-band.b-user .vK-kind { color: var(--accent); }
.vK-band.b-ask .vK-kind { color: var(--warn); }
.vK-ask { font-size: 15.5px; line-height: 1.5; color: #f4f6fb; }
.vK-say { font-size: 15px; line-height: 1.66; }
.vK-run { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vK-run em { font-style: normal; color: var(--ink-3); }
.vK-out { margin: 6px 0 0; padding-left: 12px; border-left: 1px solid #1c2029; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #6b7383; white-space: pre-wrap; overflow-x: auto; }

.vK-perm-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 3px; font-family: var(--mono); font-size: 11.5px; }
.vK-perm-arg b { font-weight: 400; color: var(--ink-3); }
.vK-perm-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vK-perm-act { display: flex; align-items: center; gap: 9px; margin-top: 11px; font-family: var(--mono); font-size: 12px; }
.vK-y { padding: 3px 13px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vK-n { padding: 3px 13px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vK-perm-act em { font-style: normal; color: var(--ink-3); }
.vK-q { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 12px; color: #7b8496; }
.vK-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vK-q button { color: #5a6273; font-size: 11px; }
.vK-q button:hover { color: var(--ink); }

.vK-empty { display: grid; place-items: center; height: 100%; }
.vK-empty p { max-width: 400px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.7; color: var(--ink-3); }
.vK-empty span { color: var(--ok); }

.vK-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vK-foot-in { max-width: 880px; margin: 0 auto; padding: 10px 28px 14px 84px; }
.vK-composer { display: flex; align-items: flex-start; gap: 10px; }
.vK-caret { padding-top: 3px; color: var(--accent); font-family: var(--mono); font-size: 13px; }
.vK-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; line-height: 1.5; }
.vK-composer textarea::placeholder { color: #454c5a; }
.vK-send { padding: 5px 15px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vK-err { margin: 0 0 8px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");

  return (
    <div className="vK">
      <style>{css}</style>

      <header className="vK-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="s">·</span>
        {scenario.model}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vK-scroll">
        {scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0 ? (
          <div className="vK-empty">
            <p><span>ready</span> — workspace open, no turns yet.<br />Every question, run and permission check lands on this spine.</p>
          </div>
        ) : (
          <>
            {scenario.messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <section className="vK-band b-user" key={m.id}>
                    <div className="vK-in">
                      <span className="vK-ts">{m.ts}</span>
                      <div className="vK-kind">› you</div>
                      <div className="vK-ask">{m.content}</div>
                    </div>
                  </section>
                );
              }
              if (m.role === "tool") {
                return (
                  <section className={`vK-band b-run ${m.status === "running" ? "b-live" : ""}`} key={m.id}>
                    <div className="vK-in">
                      <span className="vK-ts">{m.ts}</span>
                      <div className="vK-kind">{m.status === "running" ? "◐ running" : "✓ ran"}</div>
                      <div className="vK-run">
                        <strong>{m.toolName}</strong> <em>{m.args}</em>
                      </div>
                      {m.result && <pre className="vK-out">{m.result}</pre>}
                      {m.status === "running" && <pre className="vK-out">waiting…</pre>}
                    </div>
                  </section>
                );
              }
              return (
                <section className="vK-band" key={m.id}>
                  <div className="vK-in">
                    <span className="vK-ts">{m.ts}</span>
                    <div className="vK-kind">smith</div>
                    <div className="vK-say">
                      <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                    </div>
                  </div>
                </section>
              );
            })}

            {pending.map((a) => (
              <section className="vK-band b-ask" key={a.request.id}>
                <div className="vK-in">
                  <span className="vK-ts">now</span>
                  <div className="vK-kind">? waiting on you</div>
                  <div className="vK-run">{approvalTitle(a.request.kind)} — <em>{a.request.toolName}</em></div>
                  {argLines(a.request.args).map(([k, v]) => (
                    <div className="vK-perm-arg" key={k}><b>{k}</b><span>{v}</span></div>
                  ))}
                  <div className="vK-perm-act">
                    <button className="vK-y" onClick={() => noop("approve")}>y — approve</button>
                    <button className="vK-n" onClick={() => noop("deny")}>n — deny</button>
                    <em>run parked</em>
                  </div>
                </div>
              </section>
            ))}

            {scenario.queued.map((q, i) => (
              <section className="vK-band b-queue" key={q.id}>
                <div className="vK-in">
                  <span className="vK-ts">—</span>
                  <div className="vK-kind">queued {i + 1}/{scenario.queued.length}</div>
                  <div className="vK-q">
                    <p>{q.message}</p>
                    <button onClick={() => noop("edit")}>edit</button>
                    <button onClick={() => noop("cancel")}>rm</button>
                  </div>
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <div className="vK-foot">
        <div className="vK-foot-in">
          {scenario.error && <p className="vK-err">! {scenario.error}</p>}
          <div className="vK-composer">
            <span className="vK-caret">›</span>
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
            <button className="vK-send" onClick={() => noop("send")}>send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantK: Variant = {
  key: "K",
  name: "Spine through bands",
  note: "D's spine drawn continuously across G's full-bleed bands, with I's sigils and hanging timestamps.",
  Component,
};
