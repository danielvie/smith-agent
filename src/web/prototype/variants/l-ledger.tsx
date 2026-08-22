// PROTOTYPE variant L (gen 2: D x G x I). Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vL { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: var(--bg); }
.vL-bar { display: flex; align-items: center; padding: 7px 18px; border-bottom: 1px solid var(--line); background: #0e1016; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vL-bar b { color: var(--accent); font-weight: 600; }
.vL-bar .s { margin: 0 8px; color: var(--line-2); }
.vL-bar .sp { margin-left: auto; }
.vL-bar .on { color: var(--warn); }
.vL-bar button { padding: 3px 10px; margin-left: 10px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-family: var(--mono); font-size: 11px; }

.vL-head { display: grid; grid-template-columns: 128px 1fr; max-width: 1040px; margin: 0 auto; width: 100%; padding: 6px 24px 6px 0; }
.vL-head span { padding-left: 18px; font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #454c5a; }
.vL-head span:first-child { padding-left: 18px; }

.vL-scroll { overflow-y: auto; }
.vL-row { display: grid; grid-template-columns: 128px 1fr; max-width: 1040px; margin: 0 auto; padding-right: 24px; }
.vL-row.r-user { background: #14171f; }
.vL-row.r-run { background: #0d0f15; }
.vL-row.r-ask { background: #191510; }
.vL-row.r-queue { background: #0d0f15; }
.vL-gut { display: flex; align-items: baseline; gap: 8px; padding: 15px 14px 15px 18px; border-right: 1px solid var(--line); font-family: var(--mono); font-size: 11px; color: #454c5a; }
.vL-gut i { font-style: normal; color: var(--ink-3); }
.vL-row.r-user .vL-gut i { color: var(--accent); }
.vL-row.r-run .vL-gut i { color: var(--ok); }
.vL-row.r-live .vL-gut i { color: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vL-row.r-ask .vL-gut i { color: var(--warn); }
.vL-gut b { font-weight: 400; color: var(--ink-3); }
.vL-body { min-width: 0; padding: 15px 0 15px 22px; }

.vL-ask { font-size: 15.5px; line-height: 1.5; color: #f4f6fb; }
.vL-say { font-size: 15px; line-height: 1.66; }
.vL-run { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vL-run em { font-style: normal; color: var(--ink-3); }
.vL-out { margin: 6px 0 0; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #6b7383; white-space: pre-wrap; overflow-x: auto; }
.vL-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 3px; font-family: var(--mono); font-size: 11.5px; }
.vL-arg b { font-weight: 400; color: var(--ink-3); }
.vL-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vL-act { display: flex; align-items: center; gap: 9px; margin-top: 11px; font-family: var(--mono); font-size: 12px; }
.vL-y { padding: 3px 13px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vL-n { padding: 3px 13px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vL-act em { font-style: normal; color: var(--ink-3); }
.vL-q { display: flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 12px; color: #7b8496; }
.vL-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vL-q button { color: #5a6273; font-size: 11px; }
.vL-q button:hover { color: var(--ink); }

.vL-empty { display: grid; place-items: center; height: 100%; }
.vL-empty p { max-width: 420px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.7; color: var(--ink-3); }
.vL-empty span { color: var(--ok); }

.vL-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vL-foot-grid { display: grid; grid-template-columns: 128px 1fr; max-width: 1040px; margin: 0 auto; padding-right: 24px; }
.vL-foot-gut { padding: 12px 14px 14px 18px; border-right: 1px solid var(--line); font-family: var(--mono); font-size: 11px; color: #454c5a; }
.vL-foot-body { padding: 10px 0 14px 22px; }
.vL-composer { display: flex; align-items: flex-start; gap: 10px; }
.vL-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; line-height: 1.5; }
.vL-composer textarea::placeholder { color: #454c5a; }
.vL-send { padding: 5px 15px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vL-err { margin: 0 0 8px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

function Row({ kind, ts, sigil, label, children }: { kind: string; ts: string; sigil: string; label: string; children: React.ReactNode }) {
  return (
    <div className={`vL-row ${kind}`}>
      <div className="vL-gut">
        {ts}
        <i>{sigil}</i>
        <b>{label}</b>
      </div>
      <div className="vL-body">{children}</div>
    </div>
  );
}

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const empty = scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0;

  return (
    <div className="vL">
      <style>{css}</style>

      <header className="vL-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="s">·</span>
        {scenario.model}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vL-scroll">
        {empty ? (
          <div className="vL-empty">
            <p><span>ready</span> — the left column is the ledger: time, sigil, kind.<br />Content stays on the right, at reading width.</p>
          </div>
        ) : (
          <>
            <div className="vL-head"><span>when · what</span><span /></div>
            {scenario.messages.map((m, i) => {
              if (m.role === "user") {
                return (
                  <Row kind="r-user" ts={m.ts} sigil="›" label="you" key={m.id}>
                    <div className="vL-ask">{m.content}</div>
                  </Row>
                );
              }
              if (m.role === "tool") {
                return (
                  <Row kind={`r-run ${m.status === "running" ? "r-live" : ""}`} ts={m.ts} sigil={m.status === "running" ? "◐" : "✓"} label="run" key={m.id}>
                    <div className="vL-run"><strong>{m.toolName}</strong> <em>{m.args}</em></div>
                    {m.result && <pre className="vL-out">{m.result}</pre>}
                    {m.status === "running" && <pre className="vL-out">waiting…</pre>}
                  </Row>
                );
              }
              return (
                <Row kind="" ts={m.ts} sigil="·" label="smith" key={m.id}>
                  <div className="vL-say">
                    <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                  </div>
                </Row>
              );
            })}

            {pending.map((a) => (
              <Row kind="r-ask" ts="now" sigil="?" label="perm" key={a.request.id}>
                <div className="vL-run">{approvalTitle(a.request.kind)} — <em>{a.request.toolName}</em></div>
                {argLines(a.request.args).map(([k, v]) => (
                  <div className="vL-arg" key={k}><b>{k}</b><span>{v}</span></div>
                ))}
                <div className="vL-act">
                  <button className="vL-y" onClick={() => noop("approve")}>y — approve</button>
                  <button className="vL-n" onClick={() => noop("deny")}>n — deny</button>
                  <em>run parked</em>
                </div>
              </Row>
            ))}

            {scenario.queued.map((q, i) => (
              <Row kind="r-queue" ts="—" sigil="»" label={`q${i + 1}`} key={q.id}>
                <div className="vL-q">
                  <p>{q.message}</p>
                  <button onClick={() => noop("edit")}>edit</button>
                  <button onClick={() => noop("cancel")}>rm</button>
                </div>
              </Row>
            ))}
          </>
        )}
      </div>

      <div className="vL-foot">
        <div className="vL-foot-grid">
          <div className="vL-foot-gut">{scenario.running ? "queues" : "sends now"}</div>
          <div className="vL-foot-body">
            {scenario.error && <p className="vL-err">! {scenario.error}</p>}
            <div className="vL-composer">
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
              <button className="vL-send" onClick={() => noop("send")}>send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantL: Variant = {
  key: "L",
  name: "Ledger gutter",
  note: "The spine becomes a fixed monospace ledger column — time, sigil, kind — with banded rows beside it.",
  Component,
};
