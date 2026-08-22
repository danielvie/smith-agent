// PROTOTYPE variant R (gen 2: D x G x I). Throwaway.
import { useState } from "react";
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vR { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: var(--bg); }
.vR-bar { display: flex; align-items: center; padding: 7px 18px; border-bottom: 1px solid var(--line); background: #0e1016; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vR-bar b { color: var(--accent); font-weight: 600; }
.vR-bar .s { margin: 0 8px; color: var(--line-2); }
.vR-bar .sp { margin-left: auto; }
.vR-bar .on { color: var(--warn); }
.vR-bar button { padding: 3px 10px; margin-left: 8px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-family: var(--mono); font-size: 11px; }
.vR-mode { display: inline-flex; margin-left: 8px; border: 1px solid var(--line-2); border-radius: 3px; overflow: hidden; }
.vR-mode button { margin: 0; border: 0; border-radius: 0; padding: 3px 11px; }
.vR-mode button.on { background: var(--bg-3); color: var(--ink); }

.vR-scroll { overflow-y: auto; }
.vR-node { }
.vR-node.n-user { background: #14171f; }
.vR-node.n-run { background: #0d0f15; }
.vR-node.n-ask { background: #191510; }
.vR-in { position: relative; max-width: 880px; margin: 0 auto; padding-left: 82px; padding-right: 26px; }
.vR-in::before { content: ""; position: absolute; top: 0; bottom: 0; left: 56px; width: 1px; background: #1e232e; }
.vR-in::after { content: ""; position: absolute; left: 53px; width: 7px; height: 7px; border-radius: 999px; background: #2a3140; }
.vR-node.n-user .vR-in::after { background: var(--accent); }
.vR-node.n-run .vR-in::after { background: var(--ok); }
.vR-node.n-live .vR-in::after { background: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vR-node.n-ask .vR-in::after { background: var(--warn); }
.vR-node.n-queue .vR-in::after { background: none; box-shadow: inset 0 0 0 1px #39404f; }
.vR-ts { position: absolute; left: 0; width: 44px; text-align: right; font-family: var(--mono); font-size: 10.5px; color: #3f4653; }

/* compact: one line per node, terminal digest */
.vR.m-compact .vR-in { padding-top: 3px; padding-bottom: 3px; }
.vR.m-compact .vR-in::after { top: 8px; }
.vR.m-compact .vR-ts { top: 4px; }
.vR.m-compact .vR-kind { display: none; }
.vR.m-compact .vR-row { display: flex; align-items: baseline; gap: 10px; font-family: var(--mono); font-size: 12px; line-height: 1.5; color: var(--ink-2); }
.vR.m-compact .vR-row .vR-txt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vR.m-compact .vR-node.n-user .vR-txt { color: #eef1f7; }
.vR.m-compact .vR-body { display: none; }
.vR.m-compact .vR-node.n-ask .vR-body { display: block; padding-bottom: 12px; }

/* full: bands with room to read */
.vR.m-full .vR-in { padding-top: 15px; padding-bottom: 16px; }
.vR.m-full .vR-in::after { top: 21px; }
.vR.m-full .vR-ts { top: 17px; }
.vR.m-full .vR-row { display: none; }
.vR.m-full .vR-kind { margin-bottom: 6px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .06em; color: var(--ink-3); }
.vR.m-full .vR-node.n-user .vR-kind { color: var(--accent); }
.vR.m-full .vR-node.n-ask .vR-kind { color: var(--warn); }

.vR-ask { font-size: 15.5px; line-height: 1.5; color: #f4f6fb; }
.vR-say { font-size: 15px; line-height: 1.66; }
.vR-run { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vR-run em { font-style: normal; color: #5f6779; }
.vR-out { margin: 6px 0 0; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #6b7383; white-space: pre-wrap; overflow-x: auto; }
.vR-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 4px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); }
.vR-arg b { font-weight: 400; color: #7a8290; }
.vR-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vR-act { display: flex; align-items: center; gap: 9px; margin-top: 12px; font-family: var(--mono); font-size: 12px; }
.vR-y { padding: 3px 13px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vR-n { padding: 3px 13px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vR-act em { font-style: normal; color: #7a8290; }
.vR-q { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 12px; color: #7b8496; }
.vR-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vR-q button { color: #5a6273; font-size: 11px; }
.vR-q button:hover { color: var(--ink); }

.vR-empty { display: grid; place-items: center; height: 100%; }
.vR-empty p { max-width: 430px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.8; color: var(--ink-3); }
.vR-empty span { color: var(--ok); }

.vR-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vR-foot-in { max-width: 880px; margin: 0 auto; padding: 11px 26px 15px 82px; }
.vR-composer { display: flex; align-items: flex-start; gap: 10px; }
.vR-caret { padding-top: 3px; margin-left: -22px; color: var(--accent); font-family: var(--mono); font-size: 13px; }
.vR-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; line-height: 1.5; }
.vR-composer textarea::placeholder { color: #454c5a; }
.vR-send { padding: 5px 15px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vR-err { margin: 0 0 8px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const [mode, setMode] = useState<"compact" | "full">("full");
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const empty = scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0;

  return (
    <div className={`vR m-${mode}`}>
      <style>{css}</style>

      <header className="vR-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <span className="vR-mode">
          <button className={mode === "compact" ? "on" : ""} onClick={() => setMode("compact")}>digest</button>
          <button className={mode === "full" ? "on" : ""} onClick={() => setMode("full")}>read</button>
        </span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vR-scroll">
        {empty ? (
          <div className="vR-empty">
            <p><span>ready</span> — the same spine at two densities.<br /><em>digest</em> gives you one line per event;<br /><em>read</em> opens the bands back up.</p>
          </div>
        ) : (
          <>
            {scenario.messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <section className="vR-node n-user" key={m.id}>
                    <div className="vR-in">
                      <span className="vR-ts">{m.ts}</span>
                      <div className="vR-row"><span>›</span><span className="vR-txt">{m.content}</span></div>
                      <div className="vR-kind">› you</div>
                      <div className="vR-body"><div className="vR-ask">{m.content}</div></div>
                    </div>
                  </section>
                );
              }
              if (m.role === "tool") {
                return (
                  <section className={`vR-node n-run ${m.status === "running" ? "n-live" : ""}`} key={m.id}>
                    <div className="vR-in">
                      <span className="vR-ts">{m.ts}</span>
                      <div className="vR-row">
                        <span>{m.status === "running" ? "◐" : "✓"}</span>
                        <strong>{m.toolName}</strong>
                        <span className="vR-txt" style={{ color: "#5f6779" }}>{m.args}</span>
                      </div>
                      <div className="vR-kind">{m.status === "running" ? "◐ running" : "✓ ran"}</div>
                      <div className="vR-body">
                        <div className="vR-run"><strong>{m.toolName}</strong> <em>{m.args}</em></div>
                        {m.result && <pre className="vR-out">{m.result}</pre>}
                        {m.status === "running" && <pre className="vR-out">waiting…</pre>}
                      </div>
                    </div>
                  </section>
                );
              }
              return (
                <section className="vR-node" key={m.id}>
                  <div className="vR-in">
                    <span className="vR-ts">{m.ts}</span>
                    <div className="vR-row"><span>·</span><span className="vR-txt">{m.content.replace(/[#*`|]/gu, "").split("\n").filter(Boolean)[0]}</span></div>
                    <div className="vR-kind">smith</div>
                    <div className="vR-body">
                      <div className="vR-say">
                        <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}

            {pending.map((a) => (
              <section className="vR-node n-ask" key={a.request.id}>
                <div className="vR-in">
                  <span className="vR-ts">now</span>
                  <div className="vR-row"><span>?</span><span className="vR-txt">{approvalTitle(a.request.kind).toLowerCase()} — {a.request.toolName}</span></div>
                  <div className="vR-kind">? waiting on you</div>
                  <div className="vR-body">
                    {argLines(a.request.args).map(([k, v]) => (
                      <div className="vR-arg" key={k}><b>{k}</b><span>{v}</span></div>
                    ))}
                    <div className="vR-act">
                      <button className="vR-y" onClick={() => noop("approve")}>y — approve</button>
                      <button className="vR-n" onClick={() => noop("deny")}>n — deny</button>
                      <em>run parked</em>
                    </div>
                  </div>
                </div>
              </section>
            ))}

            {scenario.queued.map((q, i) => (
              <section className="vR-node n-queue" key={q.id}>
                <div className="vR-in">
                  <span className="vR-ts">q{i + 1}</span>
                  <div className="vR-row"><span>»</span><span className="vR-txt" style={{ color: "#7b8496" }}>{q.message}</span></div>
                  <div className="vR-kind">queued {i + 1}/{scenario.queued.length}</div>
                  <div className="vR-body">
                    <div className="vR-q">
                      <p>{q.message}</p>
                      <button onClick={() => noop("edit")}>edit</button>
                      <button onClick={() => noop("cancel")}>rm</button>
                    </div>
                  </div>
                </div>
              </section>
            ))}
          </>
        )}
      </div>

      <div className="vR-foot">
        <div className="vR-foot-in">
          {scenario.error && <p className="vR-err">! {scenario.error}</p>}
          <div className="vR-composer">
            <span className="vR-caret">›</span>
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
            <button className="vR-send" onClick={() => noop("send")}>send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantR: Variant = {
  key: "R",
  name: "Two densities",
  note: "One spine, two densities: digest collapses every node to a line; read opens the bands. Approvals stay open in both.",
  Component,
};
