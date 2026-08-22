// PROTOTYPE variant P (gen 2: D x G x I). Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vP { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: var(--bg); }
.vP-bar { display: flex; align-items: center; padding: 7px 18px; border-bottom: 1px solid var(--line); background: #0e1016; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vP-bar b { color: var(--accent); font-weight: 600; }
.vP-bar .s { margin: 0 8px; color: var(--line-2); }
.vP-bar .sp { margin-left: auto; }
.vP-bar .on { color: var(--warn); }
.vP-bar button { padding: 3px 10px; margin-left: 10px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-family: var(--mono); font-size: 11px; }

.vP-scroll { overflow-y: auto; }
.vP-band { }
.vP-band.b-user { background: #14171f; }
.vP-band.b-run { background: #0d0f15; }
.vP-in { position: relative; max-width: 860px; margin: 0 auto; padding: 15px 26px 15px 78px; }
.vP-in::before { content: ""; position: absolute; top: 0; bottom: 0; left: 52px; width: 1px; background: var(--line); }
.vP-in::after { content: ""; position: absolute; top: 21px; left: 49px; width: 7px; height: 7px; border-radius: 999px; background: var(--ink-3); }
.vP-band.b-user .vP-in::after { background: var(--accent); }
.vP-band.b-run .vP-in::after { background: var(--ok); }
.vP-ts { position: absolute; top: 17px; left: 0; width: 40px; text-align: right; font-family: var(--mono); font-size: 10.5px; color: #3f4653; }
.vP-kind { margin-bottom: 6px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; color: var(--ink-3); }
.vP-band.b-user .vP-kind { color: var(--accent); }
.vP-ask { font-size: 15.5px; line-height: 1.5; color: #f4f6fb; }
.vP-say { font-size: 15px; line-height: 1.66; }
.vP-run { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vP-run em { font-style: normal; color: var(--ink-3); }
.vP-out { margin: 6px 0 0; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #6b7383; white-space: pre-wrap; overflow-x: auto; }

/* the live tail: pinned above the composer, anchored to the spine by a dashed link */
.vP-tailwrap { position: relative; background: #07090d; border-top: 1px solid #1c2029; }
.vP-tail { position: relative; max-width: 860px; margin: 0 auto; padding: 10px 26px 12px 78px; }
.vP-tail::before { content: ""; position: absolute; top: -1px; bottom: 14px; left: 52px; width: 1px; background: repeating-linear-gradient(to bottom, var(--warn) 0 3px, transparent 3px 7px); }
.vP-tail::after { content: ""; position: absolute; bottom: 12px; left: 49px; width: 7px; height: 7px; border-radius: 999px; background: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vP-tail-h { display: flex; align-items: baseline; gap: 10px; margin-bottom: 6px; font-family: var(--mono); font-size: 11px; color: var(--warn); }
.vP-tail-h span { margin-left: auto; color: #4d5462; }
.vP-tail-body { max-height: 108px; overflow-y: auto; font-family: var(--mono); font-size: 11.5px; line-height: 1.65; color: #7b8496; white-space: pre-wrap; }
.vP-tail-body b { display: block; color: var(--ink-2); font-weight: 500; }

.vP-perm { background: #16120b; border-top: 1px solid rgb(240 184 102 / 28%); }
.vP-perm-in { position: relative; max-width: 860px; margin: 0 auto; padding: 13px 26px 15px 78px; }
.vP-perm-in::before { content: ""; position: absolute; top: 0; bottom: 0; left: 52px; width: 1px; background: rgb(240 184 102 / 40%); }
.vP-perm-in::after { content: ""; position: absolute; top: 19px; left: 49px; width: 7px; height: 7px; border-radius: 999px; background: var(--warn); }
.vP-perm-h { font-family: var(--mono); font-size: 12px; color: var(--warn); }
.vP-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 4px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); }
.vP-arg b { font-weight: 400; color: #7a8290; }
.vP-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vP-act { display: flex; align-items: center; gap: 9px; margin-top: 12px; font-family: var(--mono); font-size: 12px; }
.vP-y { padding: 3px 13px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vP-n { padding: 3px 13px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vP-act em { font-style: normal; color: #7a8290; }

.vP-empty { display: grid; place-items: center; height: 100%; }
.vP-empty p { max-width: 420px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.7; color: var(--ink-3); }
.vP-empty span { color: var(--ok); }

.vP-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vP-foot-in { max-width: 860px; margin: 0 auto; padding: 10px 26px 14px 78px; }
.vP-q { display: flex; align-items: center; gap: 10px; padding: 3px 0; font-family: var(--mono); font-size: 12px; color: #7b8496; }
.vP-q i { font-style: normal; color: #3f4653; }
.vP-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vP-q button { color: #5a6273; font-size: 11px; }
.vP-q button:hover { color: var(--ink); }
.vP-composer { display: flex; align-items: flex-start; gap: 10px; margin-top: 6px; }
.vP-caret { padding-top: 3px; margin-left: -22px; color: var(--accent); font-family: var(--mono); font-size: 13px; }
.vP-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; line-height: 1.5; }
.vP-composer textarea::placeholder { color: #454c5a; }
.vP-send { padding: 5px 15px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vP-err { margin: 0 0 8px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const live = scenario.messages.find((m) => m.role === "tool" && m.status === "running");
  const settled = scenario.messages.filter((m) => m !== live);
  const empty = scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0;

  return (
    <div className="vP">
      <style>{css}</style>

      <header className="vP-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="s">·</span>
        {scenario.model}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vP-scroll">
        {empty ? (
          <div className="vP-empty">
            <p><span>ready</span> — finished work scrolls in the history above.<br />Whatever is running right now stays pinned at the bottom.</p>
          </div>
        ) : (
          settled.map((m, i) => {
            if (m.role === "user") {
              return (
                <section className="vP-band b-user" key={m.id}>
                  <div className="vP-in">
                    <span className="vP-ts">{m.ts}</span>
                    <div className="vP-kind">› you</div>
                    <div className="vP-ask">{m.content}</div>
                  </div>
                </section>
              );
            }
            if (m.role === "tool") {
              return (
                <section className="vP-band b-run" key={m.id}>
                  <div className="vP-in">
                    <span className="vP-ts">{m.ts}</span>
                    <div className="vP-kind">✓ ran</div>
                    <div className="vP-run"><strong>{m.toolName}</strong> <em>{m.args}</em></div>
                    {m.result && <pre className="vP-out">{m.result}</pre>}
                  </div>
                </section>
              );
            }
            return (
              <section className="vP-band" key={m.id}>
                <div className="vP-in">
                  <span className="vP-ts">{m.ts}</span>
                  <div className="vP-kind">smith</div>
                  <div className="vP-say">
                    <Md source={m.content} className={scenario.streamingTail && i === settled.length - 1 ? "p-caret" : ""} />
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>

      <div>
        {live && (
          <div className="vP-tailwrap">
            <div className="vP-tail">
              <div className="vP-tail-h">
                ◐ running now
                <span>{live.ts}</span>
              </div>
              <div className="vP-tail-body">
                <b>{live.toolName} {live.args}</b>
                {"waiting for output…"}
              </div>
            </div>
          </div>
        )}

        {pending.map((a) => (
          <div className="vP-perm" key={a.request.id}>
            <div className="vP-perm-in">
              <div className="vP-perm-h">? {approvalTitle(a.request.kind).toLowerCase()} — {a.request.toolName}</div>
              {argLines(a.request.args).map(([k, v]) => (
                <div className="vP-arg" key={k}><b>{k}</b><span>{v}</span></div>
              ))}
              <div className="vP-act">
                <button className="vP-y" onClick={() => noop("approve")}>y — approve</button>
                <button className="vP-n" onClick={() => noop("deny")}>n — deny</button>
                <em>run parked until you answer</em>
              </div>
            </div>
          </div>
        ))}

        <div className="vP-foot">
          <div className="vP-foot-in">
            {scenario.queued.map((q, i) => (
              <div className="vP-q" key={q.id}>
                <i>q{i + 1}</i>
                <p>{q.message}</p>
                <button onClick={() => noop("edit")}>edit</button>
                <button onClick={() => noop("cancel")}>rm</button>
              </div>
            ))}
            {scenario.error && <p className="vP-err" style={{ marginTop: 8 }}>! {scenario.error}</p>}
            <div className="vP-composer">
              <span className="vP-caret">›</span>
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
              <button className="vP-send" onClick={() => noop("send")}>send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantP: Variant = {
  key: "P",
  name: "Live tail",
  note: "History scrolls above; the currently running tool is pinned in a tail strip, still hung off the spine.",
  Component,
};
