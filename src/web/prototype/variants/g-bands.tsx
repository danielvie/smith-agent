// PROTOTYPE variant G. Throwaway.
import { useState } from "react";
import { Md } from "../md";
import { approvalTitle, argLines, shortPath, type Variant, type VariantProps } from "../kit";

const css = `
.vG { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: var(--bg); }
.vG-top { display: flex; align-items: baseline; gap: 14px; padding: 14px 0; }
.vG-top-inner { display: flex; align-items: baseline; gap: 14px; width: 100%; max-width: 820px; margin: 0 auto; padding: 0 26px; }
.vG-title { font-size: 14px; font-weight: 620; letter-spacing: -.01em; }
.vG-top code { font-family: var(--mono); font-size: 11px; color: var(--ink-3); }
.vG-top .vG-spacer { margin-left: auto; }
.vG-state { font-size: 11px; letter-spacing: .07em; text-transform: uppercase; color: var(--ink-3); }
.vG-state.on { color: var(--warn); }

.vG-scroll { overflow-y: auto; }
.vG-band { border-top: 1px solid var(--line); }
.vG-band:first-child { border-top: 0; }
.vG-band-in { max-width: 820px; margin: 0 auto; padding: 24px 26px; }
.vG-band.b-user { background: var(--bg-1); }
.vG-band.b-user .vG-band-in { padding: 20px 26px; }
.vG-label { margin-bottom: 8px; font-size: 10px; font-weight: 600; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
.vG-ask { font-size: 16px; line-height: 1.5; color: #f4f6fb; }
.vG-say { font-size: 15px; line-height: 1.68; }

.vG-runs { max-width: 820px; margin: 0 auto; padding: 0 26px; }
.vG-row { display: flex; align-items: center; gap: 11px; width: 100%; padding: 7px 0; border-bottom: 1px solid var(--line); text-align: left; font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vG-row:last-child { border-bottom: 0; }
.vG-row em { font-style: normal; color: var(--ink-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vG-row .vG-chev { margin-left: auto; color: var(--ink-3); font-size: 10px; }
.vG-row.on b { color: var(--warn); }
.vG-out { margin: 0 0 10px; padding: 9px 12px; border-radius: 6px; background: #0c0e13; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: var(--ink-3); white-space: pre-wrap; overflow-x: auto; }

.vG-empty { display: grid; place-items: center; height: 100%; }
.vG-empty div { max-width: 380px; text-align: center; }
.vG-empty h2 { margin: 0 0 8px; font-size: 19px; font-weight: 500; color: var(--ink-2); }
.vG-empty p { margin: 0; font-size: 13px; color: var(--ink-3); }

.vG-foot { border-top: 1px solid var(--line); background: var(--bg-1); }
.vG-foot-in { max-width: 820px; margin: 0 auto; padding: 14px 26px 18px; }
.vG-approval { margin-bottom: 10px; padding: 0 0 0 13px; border-left: 3px solid var(--warn); }
.vG-approval h4 { margin: 0 0 6px; font-size: 13px; font-weight: 620; color: var(--warn); }
.vG-arg { display: flex; gap: 8px; margin-bottom: 3px; font-family: var(--mono); font-size: 11.5px; }
.vG-arg b { flex: 0 0 58px; font-weight: 500; color: var(--ink-3); }
.vG-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vG-act { display: flex; gap: 7px; margin-top: 10px; }
.vG-approve { padding: 5px 13px; border-radius: 6px; background: var(--warn); color: #1a1408; font-size: 12px; font-weight: 640; }
.vG-deny { padding: 5px 13px; border: 1px solid var(--line-2); border-radius: 6px; color: var(--ink-2); font-size: 12px; }
.vG-q { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--line); font-size: 12.5px; color: var(--ink-3); }
.vG-q p { flex: 1; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vG-q button { color: var(--ink-3); font-size: 11px; }
.vG-q button:hover { color: var(--ink); }
.vG-q-n { font-family: var(--mono); font-size: 10.5px; }
.vG-composer { display: flex; align-items: flex-end; gap: 12px; margin-top: 12px; }
.vG-composer textarea { flex: 1; padding: 0; border: 0; border-bottom: 1px solid var(--line-2); background: none; outline: none; resize: none; font-size: 15px; line-height: 1.5; }
.vG-composer textarea:focus { border-bottom-color: var(--accent); }
.vG-composer textarea::placeholder { color: var(--ink-3); }
.vG-send { padding: 6px 16px; border-radius: 6px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vG-err { margin: 0 0 8px; font-size: 12px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pending = scenario.approvals.filter((a) => a.status === "pending");

  const groups: Array<{ kind: "band"; message: (typeof scenario.messages)[number] } | { kind: "runs"; items: typeof scenario.messages }> = [];
  for (const m of scenario.messages) {
    const last = groups[groups.length - 1];
    if (m.role === "tool") {
      if (last && last.kind === "runs") last.items.push(m);
      else groups.push({ kind: "runs", items: [m] });
    } else {
      groups.push({ kind: "band", message: m });
    }
  }

  return (
    <div className="vG">
      <style>{css}</style>

      <header className="vG-top">
        <div className="vG-top-inner">
          <span className="vG-title">Smith</span>
          <code>{scenario.workspace}</code>
          <span className="vG-spacer" />
          <span className={`vG-state ${scenario.running ? "on" : ""}`}>{scenario.running ? "Working" : "Idle"}</span>
          <code>{scenario.model}</code>
        </div>
      </header>

      <div className="vG-scroll">
        {scenario.messages.length === 0 ? (
          <div className="vG-empty">
            <div>
              <h2>Nothing yet</h2>
              <p>Ask a question and it becomes the first band. Runs collapse into single lines between bands.</p>
            </div>
          </div>
        ) : (
          groups.map((group, gi) =>
            group.kind === "band" ? (
              <section className={`vG-band ${group.message.role === "user" ? "b-user" : ""}`} key={group.message.id}>
                <div className="vG-band-in">
                  <div className="vG-label">{group.message.role === "user" ? "You" : "Smith"}</div>
                  {group.message.role === "user" ? (
                    <div className="vG-ask">{group.message.content}</div>
                  ) : (
                    <div className="vG-say">
                      <Md source={group.message.content} className={scenario.streamingTail && gi === groups.length - 1 ? "p-caret" : ""} />
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section className="vG-band" key={`runs-${gi}`}>
                <div className="vG-band-in" style={{ paddingTop: 10, paddingBottom: 10 }}>
                  <div className="vG-runs" style={{ padding: 0 }}>
                    {group.items.map((t) => (
                      <div key={t.id}>
                        <button className={`vG-row ${t.status === "running" ? "on" : ""}`} onClick={() => setExpanded({ ...expanded, [t.id]: !expanded[t.id] })}>
                          <b>{t.toolName}</b>
                          <em>{t.args}</em>
                          <span className="vG-chev">{t.status === "running" ? "running" : expanded[t.id] ? "▲" : "▼"}</span>
                        </button>
                        {expanded[t.id] && t.result && <pre className="vG-out">{t.result}</pre>}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ),
          )
        )}
      </div>

      <div className="vG-foot">
        <div className="vG-foot-in">
          {pending.map((a) => (
            <div className="vG-approval" key={a.request.id}>
              <h4>{approvalTitle(a.request.kind)}</h4>
              {argLines(a.request.args).map(([k, v]) => (
                <div className="vG-arg" key={k}><b>{k}</b><span>{v}</span></div>
              ))}
              <div className="vG-act">
                <button className="vG-approve" onClick={() => noop("approve")}>Approve</button>
                <button className="vG-deny" onClick={() => noop("deny")}>Deny</button>
              </div>
            </div>
          ))}

          {scenario.queued.map((q, i) => (
            <div className="vG-q" key={q.id}>
              <span className="vG-q-n">{i + 1}</span>
              <p>{q.message}</p>
              <button onClick={() => noop("edit")}>Edit</button>
              <button onClick={() => noop("cancel")}>Cancel</button>
            </div>
          ))}

          {scenario.error && <p className="vG-err" style={{ marginTop: 10 }}>{scenario.error}</p>}

          <div className="vG-composer">
            <textarea rows={1} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ask about ${shortPath(scenario.workspace)}`} />
            <button className="vG-send" onClick={() => noop("send")}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantG: Variant = {
  key: "G",
  name: "Editorial bands",
  note: "Full-bleed alternating bands, no bubbles. Runs collapse into one-line disclosures between bands.",
  Component,
};
