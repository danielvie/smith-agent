// PROTOTYPE variant D. Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, shortPath, type Variant, type VariantProps } from "../kit";

const css = `
.vD { display: grid; grid-template-columns: 56px 1fr; height: 100%; background: var(--bg); }
.vD-icons { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 14px 0; border-right: 1px solid var(--line); background: var(--bg-1); }
.vD-mark { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--accent); color: var(--accent-ink); font-size: 13px; font-weight: 700; }
.vD-icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; color: var(--ink-3); font-size: 14px; }
.vD-icon:hover { background: var(--bg-3); color: var(--ink); }
.vD-icon.is-live { color: var(--warn); animation: p-pulse 1.5s ease-in-out infinite; }
.vD-icons .vD-spacer { margin-top: auto; }

.vD-main { display: grid; grid-template-rows: 1fr auto; min-width: 0; }
.vD-scroll { overflow-y: auto; padding: 26px 28px 8px; }
.vD-timeline { position: relative; max-width: 800px; margin: 0 auto; padding-left: 30px; }
.vD-timeline::before { content: ""; position: absolute; top: 6px; bottom: 6px; left: 7px; width: 1px; background: var(--line); }
.vD-node { position: relative; padding-bottom: 22px; }
.vD-node::before { content: ""; position: absolute; top: 6px; left: -30px; width: 15px; height: 15px; border: 1px solid var(--line-2); border-radius: 999px; background: var(--bg); }
.vD-node::after { content: ""; position: absolute; top: 11px; left: -25px; width: 5px; height: 5px; border-radius: 999px; background: var(--ink-3); }
.vD-node.n-user::after { background: var(--accent); }
.vD-node.n-run::after { background: var(--ok); }
.vD-node.n-live::after { background: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vD-node.n-approval::before { border-color: var(--warn); }
.vD-node.n-approval::after { background: var(--warn); }
.vD-node.n-queued::before { border-style: dashed; }
.vD-node.n-queued::after { background: none; }

.vD-meta { display: flex; align-items: baseline; gap: 9px; margin-bottom: 5px; }
.vD-kind { font-size: 10.5px; font-weight: 600; letter-spacing: .09em; text-transform: uppercase; color: var(--ink-3); }
.vD-time { font-family: var(--mono); font-size: 10.5px; color: var(--ink-3); }
.vD-body { font-size: 14.5px; }
.vD-body.is-user { color: #f3f5fa; font-weight: 500; }
.vD-run { display: flex; align-items: baseline; gap: 10px; font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vD-run em { font-style: normal; color: var(--ink-3); }
.vD-run-out { margin: 5px 0 0; padding: 7px 10px; border-radius: 6px; background: #0c0e13; font-family: var(--mono); font-size: 11px; color: var(--ink-3); white-space: pre-wrap; overflow-x: auto; }
.vD-approval { padding: 12px 14px; border: 1px solid rgb(240 184 102 / 38%); border-radius: 10px; background: rgb(240 184 102 / 6%); }
.vD-approval strong { display: block; margin-bottom: 8px; font-size: 13px; color: var(--warn); }
.vD-arg { display: flex; gap: 8px; margin-bottom: 4px; font-family: var(--mono); font-size: 11.5px; }
.vD-arg b { flex: 0 0 60px; font-weight: 500; color: var(--ink-3); }
.vD-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vD-act { display: flex; gap: 7px; margin-top: 11px; }
.vD-approve { padding: 5px 13px; border-radius: 7px; background: var(--warn); color: #1a1408; font-size: 12px; font-weight: 640; }
.vD-deny { padding: 5px 13px; border: 1px solid var(--line-2); border-radius: 7px; color: var(--ink-2); font-size: 12px; }
.vD-queued { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--ink-3); }
.vD-queued p { flex: 1; margin: 0; }
.vD-queued button { color: var(--ink-3); font-size: 11.5px; }
.vD-queued button:hover { color: var(--ink); }

.vD-empty { display: grid; place-items: center; height: 100%; }
.vD-empty p { max-width: 340px; text-align: center; color: var(--ink-3); font-size: 13.5px; }

.vD-foot { padding: 0 28px 20px; }
.vD-foot-inner { max-width: 800px; margin: 0 auto; padding-left: 30px; }
.vD-composer { display: flex; align-items: flex-end; gap: 10px; padding: 11px 13px; border: 1px solid var(--line-2); border-radius: 10px; background: var(--bg-1); }
.vD-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; }
.vD-composer textarea::placeholder { color: var(--ink-3); }
.vD-send { padding: 6px 15px; border-radius: 7px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vD-err { margin: 0 0 7px; font-size: 12px; color: var(--danger); }
`;

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");

  return (
    <div className="vD">
      <style>{css}</style>

      <nav className="vD-icons">
        <div className="vD-mark">S</div>
        <button className="vD-icon" title={scenario.workspace}>◫</button>
        <button className="vD-icon" title={scenario.model}>◈</button>
        {scenario.running && <div className="vD-icon is-live" title="Working">●</div>}
        <span className="vD-spacer" />
        <button className="vD-icon" title="Abort" disabled={!scenario.running} onClick={() => noop("abort")}>■</button>
      </nav>

      <div className="vD-main">
        <div className="vD-scroll">
          {scenario.messages.length === 0 && scenario.queued.length === 0 ? (
            <div className="vD-empty"><p>Everything Smith does lands on one timeline: your questions, its runs, and anything it needs you to approve.</p></div>
          ) : (
            <div className="vD-timeline">
              {scenario.messages.map((m, i) => {
                if (m.role === "user") {
                  return (
                    <div className="vD-node n-user" key={m.id}>
                      <div className="vD-meta"><span className="vD-kind">You</span><span className="vD-time">{m.ts}</span></div>
                      <div className="vD-body is-user">{m.content}</div>
                    </div>
                  );
                }
                if (m.role === "tool") {
                  return (
                    <div className={`vD-node ${m.status === "running" ? "n-live" : "n-run"}`} key={m.id}>
                      <div className="vD-meta"><span className="vD-kind">{m.status === "running" ? "Running" : "Ran"}</span><span className="vD-time">{m.ts}</span></div>
                      <div className="vD-run"><strong>{m.toolName}</strong><em>{m.args}</em></div>
                      {m.result && <pre className="vD-run-out">{m.result}</pre>}
                    </div>
                  );
                }
                return (
                  <div className="vD-node" key={m.id}>
                    <div className="vD-meta"><span className="vD-kind">Smith</span><span className="vD-time">{m.ts}</span></div>
                    <div className="vD-body">
                      <Md source={m.content} className={scenario.streamingTail && i === scenario.messages.length - 1 ? "p-caret" : ""} />
                    </div>
                  </div>
                );
              })}

              {pending.map((a) => (
                <div className="vD-node n-approval" key={a.request.id}>
                  <div className="vD-meta"><span className="vD-kind" style={{ color: "var(--warn)" }}>Waiting on you</span></div>
                  <div className="vD-approval">
                    <strong>{approvalTitle(a.request.kind)}</strong>
                    {argLines(a.request.args).map(([k, v]) => (
                      <div className="vD-arg" key={k}><b>{k}</b><span>{v}</span></div>
                    ))}
                    <div className="vD-act">
                      <button className="vD-approve" onClick={() => noop("approve")}>Approve</button>
                      <button className="vD-deny" onClick={() => noop("deny")}>Deny</button>
                    </div>
                  </div>
                </div>
              ))}

              {scenario.queued.map((q) => (
                <div className="vD-node n-queued" key={q.id}>
                  <div className="vD-meta"><span className="vD-kind">Queued</span></div>
                  <div className="vD-queued">
                    <p>{q.message}</p>
                    <button onClick={() => noop("edit")}>Edit</button>
                    <button onClick={() => noop("cancel")}>Cancel</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="vD-foot">
          <div className="vD-foot-inner">
            {scenario.error && <p className="vD-err">{scenario.error}</p>}
            <div className="vD-composer">
              <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Ask about ${shortPath(scenario.workspace)}`} />
              <button className="vD-send" onClick={() => noop("send")}>Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantD: Variant = {
  key: "D",
  name: "Timeline spine",
  note: "One vertical spine. Every event — question, run, approval, queued message — is a node on it.",
  Component,
};
