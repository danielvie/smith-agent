// PROTOTYPE variant Q (gen 2: D x G x I). Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vQ { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: #0b0d12; }
.vQ-bar { display: flex; align-items: center; padding: 7px 18px; border-bottom: 1px solid var(--line); background: #0e1016; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vQ-bar b { color: var(--accent); font-weight: 600; }
.vQ-bar .s { margin: 0 8px; color: var(--line-2); }
.vQ-bar .sp { margin-left: auto; }
.vQ-bar .on { color: var(--warn); }
.vQ-bar button { padding: 3px 10px; margin-left: 10px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-family: var(--mono); font-size: 11px; }

.vQ-scroll { overflow-y: auto; }
.vQ-step { position: relative; }
.vQ-step.s-user { background: #13161e; }
.vQ-step.s-run { background: #0d0f15; }
.vQ-step.s-ask { background: #191510; }
.vQ-in { position: relative; max-width: 880px; margin: 0 auto; padding: 0 26px 0 92px; }
.vQ-in::before { content: ""; position: absolute; top: 0; bottom: 0; left: 62px; width: 1px; background: #1e232e; }
.vQ-step:first-child .vQ-in::before { top: 18px; }
.vQ-num { position: absolute; top: 14px; left: 0; width: 52px; padding: 2px 0; text-align: right; font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; color: #3f4653; }
.vQ-dot { position: absolute; top: 20px; left: 58px; width: 9px; height: 9px; border-radius: 2px; background: #2a3140; }
.vQ-step.s-user .vQ-dot { background: var(--accent); }
.vQ-step.s-run .vQ-dot { background: var(--ok); }
.vQ-step.s-live .vQ-dot { background: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vQ-step.s-ask .vQ-dot { background: var(--warn); }
.vQ-step.s-queue .vQ-dot { background: none; box-shadow: inset 0 0 0 1px #39404f; }

.vQ-head { display: flex; align-items: baseline; gap: 9px; padding: 15px 0 7px; font-family: var(--mono); font-size: 10.5px; color: #4d5462; }
.vQ-head b { font-weight: 400; letter-spacing: .09em; text-transform: uppercase; color: #6b7383; }
.vQ-step.s-user .vQ-head b { color: var(--accent); }
.vQ-step.s-ask .vQ-head b { color: var(--warn); }
.vQ-head .sp { margin-left: auto; }
.vQ-content { padding-bottom: 18px; }
.vQ-ask { font-size: 15.5px; line-height: 1.5; color: #f4f6fb; }
.vQ-say { font-size: 15px; line-height: 1.68; }
.vQ-run { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vQ-run em { font-style: normal; color: #5f6779; }
.vQ-out { margin: 7px 0 0; padding: 8px 11px; border-radius: 3px; background: #07090d; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #6b7383; white-space: pre-wrap; overflow-x: auto; }
.vQ-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 4px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); }
.vQ-arg b { font-weight: 400; color: #7a8290; }
.vQ-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vQ-act { display: flex; align-items: center; gap: 9px; margin-top: 12px; font-family: var(--mono); font-size: 12px; }
.vQ-y { padding: 3px 13px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vQ-n { padding: 3px 13px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vQ-act em { font-style: normal; color: #7a8290; }
.vQ-q { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 12px; color: #7b8496; }
.vQ-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vQ-q button { color: #5a6273; font-size: 11px; }
.vQ-q button:hover { color: var(--ink); }

.vQ-empty { display: grid; place-items: center; height: 100%; }
.vQ-empty p { max-width: 400px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.8; color: var(--ink-3); }
.vQ-empty span { color: var(--ok); }

.vQ-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vQ-foot-in { position: relative; max-width: 880px; margin: 0 auto; padding: 12px 26px 15px 92px; }
.vQ-foot-num { position: absolute; top: 15px; left: 0; width: 52px; text-align: right; font-family: var(--mono); font-size: 12px; font-variant-numeric: tabular-nums; color: #3f4653; }
.vQ-composer { display: flex; align-items: flex-start; gap: 10px; }
.vQ-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; line-height: 1.5; }
.vQ-composer textarea::placeholder { color: #454c5a; }
.vQ-send { padding: 5px 15px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vQ-err { margin: 0 0 8px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const empty = scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0;
  let step = 0;
  const nextStep = () => pad(++step);

  return (
    <div className="vQ">
      <style>{css}</style>

      <header className="vQ-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="s">·</span>
        {scenario.model}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vQ-scroll">
        {empty ? (
          <div className="vQ-empty">
            <p><span>ready</span><br />every step gets a number, so you can point at one<br />and say “redo 04”.</p>
          </div>
        ) : (
          <>
            {scenario.messages.map((m, i) => {
              const n = nextStep();
              if (m.role === "user") {
                return (
                  <section className="vQ-step s-user" key={m.id}>
                    <div className="vQ-in">
                      <span className="vQ-num">{n}</span>
                      <span className="vQ-dot" />
                      <div className="vQ-head"><b>you</b><span className="sp" />{m.ts}</div>
                      <div className="vQ-content"><div className="vQ-ask">{m.content}</div></div>
                    </div>
                  </section>
                );
              }
              if (m.role === "tool") {
                return (
                  <section className={`vQ-step s-run ${m.status === "running" ? "s-live" : ""}`} key={m.id}>
                    <div className="vQ-in">
                      <span className="vQ-num">{n}</span>
                      <span className="vQ-dot" />
                      <div className="vQ-head"><b>{m.status === "running" ? "running" : "ran"}</b>{m.toolName}<span className="sp" />{m.ts}</div>
                      <div className="vQ-content">
                        <div className="vQ-run"><em>{m.args}</em></div>
                        {m.result && <pre className="vQ-out">{m.result}</pre>}
                        {m.status === "running" && <pre className="vQ-out">waiting…</pre>}
                      </div>
                    </div>
                  </section>
                );
              }
              return (
                <section className="vQ-step" key={m.id}>
                  <div className="vQ-in">
                    <span className="vQ-num">{n}</span>
                    <span className="vQ-dot" />
                    <div className="vQ-head"><b>smith</b><span className="sp" />{m.ts}</div>
                    <div className="vQ-content">
                      <div className="vQ-say">
                        <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}

            {pending.map((a) => {
              const n = nextStep();
              return (
                <section className="vQ-step s-ask" key={a.request.id}>
                  <div className="vQ-in">
                    <span className="vQ-num">{n}</span>
                    <span className="vQ-dot" />
                    <div className="vQ-head"><b>permission</b>{a.request.toolName}<span className="sp" />now</div>
                    <div className="vQ-content">
                      <div className="vQ-run">{approvalTitle(a.request.kind)}</div>
                      {argLines(a.request.args).map(([k, v]) => (
                        <div className="vQ-arg" key={k}><b>{k}</b><span>{v}</span></div>
                      ))}
                      <div className="vQ-act">
                        <button className="vQ-y" onClick={() => noop("approve")}>y — approve</button>
                        <button className="vQ-n" onClick={() => noop("deny")}>n — deny</button>
                        <em>step {n} is parked</em>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}

            {scenario.queued.map((q) => {
              const n = nextStep();
              return (
                <section className="vQ-step s-queue" key={q.id}>
                  <div className="vQ-in">
                    <span className="vQ-num">{n}</span>
                    <span className="vQ-dot" />
                    <div className="vQ-head"><b>queued</b><span className="sp" />not started</div>
                    <div className="vQ-content">
                      <div className="vQ-q">
                        <p>{q.message}</p>
                        <button onClick={() => noop("edit")}>edit</button>
                        <button onClick={() => noop("cancel")}>rm</button>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </>
        )}
      </div>

      <div className="vQ-foot">
        <div className="vQ-foot-in">
          <span className="vQ-foot-num">{pad(step + 1)}</span>
          {scenario.error && <p className="vQ-err">! {scenario.error}</p>}
          <div className="vQ-composer">
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
            <button className="vQ-send" onClick={() => noop("send")}>send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantQ: Variant = {
  key: "Q",
  name: "Numbered steps",
  note: "Each node carries an ordinal, including the one you are about to write. Bands are numbered blocks.",
  Component,
};
