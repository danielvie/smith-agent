// PROTOTYPE variant N (gen 2: D x G x I). Throwaway.
import { Md } from "../md";
import { approvalTitle, argLines, type Variant, type VariantProps } from "../kit";

const css = `
.vN { display: grid; grid-template-rows: auto 1fr auto; height: 100%; background: var(--bg); }
.vN-bar { display: flex; align-items: center; padding: 7px 18px; border-bottom: 1px solid var(--line); background: #0e1016; font-family: var(--mono); font-size: 11.5px; color: var(--ink-3); }
.vN-bar b { color: var(--accent); font-weight: 600; }
.vN-bar .s { margin: 0 8px; color: var(--line-2); }
.vN-bar .sp { margin-left: auto; }
.vN-bar .on { color: var(--warn); }
.vN-bar button { padding: 3px 10px; margin-left: 10px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); font-family: var(--mono); font-size: 11px; }

.vN-scroll { overflow-y: auto; }

/* console strip: edge-to-edge, dark, monospace, spine inside */
.vN-strip { background: #090b10; border-top: 1px solid #14171f; border-bottom: 1px solid #14171f; }
.vN-strip-in { position: relative; max-width: 820px; margin: 0 auto; padding: 9px 26px 9px 66px; }
.vN-strip-in::before { content: ""; position: absolute; top: 0; bottom: 0; left: 46px; width: 1px; background: #1c2029; }
.vN-strip + .vN-strip { border-top: 0; }
.vN-line { position: relative; display: flex; align-items: baseline; gap: 10px; padding: 2px 0; font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
.vN-line::before { content: ""; position: absolute; left: -23px; top: 8px; width: 7px; height: 7px; border-radius: 999px; background: var(--ink-3); box-shadow: 0 0 0 3px #090b10; }
.vN-line.l-user::before { background: var(--accent); }
.vN-line.l-run::before { background: var(--ok); }
.vN-line.l-live::before { background: var(--warn); animation: p-pulse 1.1s ease-in-out infinite; }
.vN-line.l-queue::before { background: none; box-shadow: 0 0 0 3px #090b10, inset 0 0 0 1px #2f3646; }
.vN-ts { position: absolute; left: -66px; width: 40px; text-align: right; font-size: 10.5px; color: #3f4653; }
.vN-line em { font-style: normal; color: #5f6779; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vN-line.l-user { color: #eef1f7; }
.vN-line .vN-tail { margin-left: auto; font-size: 11px; color: #4d5462; }
.vN-out { margin: 2px 0 5px; font-family: var(--mono); font-size: 11px; line-height: 1.6; color: #59616f; white-space: pre-wrap; overflow-x: auto; }
.vN-q-act { display: flex; gap: 8px; margin-left: auto; }
.vN-q-act button { color: #5a6273; font-family: var(--mono); font-size: 11px; }
.vN-q-act button:hover { color: var(--ink); }

/* prose band: the answer gets room and a normal typeface */
.vN-prose { background: var(--bg); }
.vN-prose-in { max-width: 820px; margin: 0 auto; padding: 24px 26px 26px 66px; font-size: 15.5px; line-height: 1.68; }

/* permission strip */
.vN-perm { background: #16120b; border-top: 1px solid rgb(240 184 102 / 26%); border-bottom: 1px solid rgb(240 184 102 / 26%); }
.vN-perm-in { max-width: 820px; margin: 0 auto; padding: 13px 26px 15px 66px; }
.vN-perm-h { font-family: var(--mono); font-size: 12px; color: var(--warn); }
.vN-arg { display: grid; grid-template-columns: 62px 1fr; gap: 9px; margin-top: 4px; font-family: var(--mono); font-size: 11.5px; color: var(--ink-2); }
.vN-arg b { font-weight: 400; color: #7a8290; }
.vN-arg span { overflow-wrap: anywhere; white-space: pre-wrap; }
.vN-act { display: flex; align-items: center; gap: 9px; margin-top: 12px; font-family: var(--mono); font-size: 12px; }
.vN-y { padding: 3px 13px; border-radius: 3px; background: var(--warn); color: #1a1408; font-weight: 700; }
.vN-n { padding: 3px 13px; border: 1px solid var(--line-2); border-radius: 3px; color: var(--ink-2); }
.vN-act em { font-style: normal; color: #7a8290; }

.vN-empty { display: grid; place-items: center; height: 100%; }
.vN-empty p { max-width: 430px; text-align: center; font-family: var(--mono); font-size: 12.5px; line-height: 1.7; color: var(--ink-3); }
.vN-empty span { color: var(--ok); }

.vN-foot { border-top: 1px solid var(--line); background: #0e1016; }
.vN-foot-in { max-width: 820px; margin: 0 auto; padding: 11px 26px 15px 66px; }
.vN-composer { display: flex; align-items: flex-start; gap: 10px; }
.vN-caret { padding-top: 3px; margin-left: -20px; color: var(--accent); font-family: var(--mono); font-size: 13px; }
.vN-composer textarea { flex: 1; border: 0; background: none; outline: none; resize: none; font-size: 14.5px; line-height: 1.5; }
.vN-composer textarea::placeholder { color: #454c5a; }
.vN-send { padding: 5px 15px; border-radius: 4px; background: var(--accent); color: var(--accent-ink); font-size: 12.5px; font-weight: 640; }
.vN-err { margin: 0 0 8px; font-family: var(--mono); font-size: 11.5px; color: var(--danger); }
`;

type Group = { kind: "strip"; items: VariantProps["scenario"]["messages"] } | { kind: "prose"; item: VariantProps["scenario"]["messages"][number] };

function Component({ scenario, draft, setDraft, noop }: VariantProps) {
  const pending = scenario.approvals.filter((a) => a.status === "pending");
  const empty = scenario.messages.length === 0 && pending.length === 0 && scenario.queued.length === 0;

  const groups: Group[] = [];
  for (const m of scenario.messages) {
    if (m.role === "assistant") {
      groups.push({ kind: "prose", item: m });
      continue;
    }
    const last = groups[groups.length - 1];
    if (last && last.kind === "strip") last.items.push(m);
    else groups.push({ kind: "strip", items: [m] });
  }

  return (
    <div className="vN">
      <style>{css}</style>

      <header className="vN-bar">
        <b>smith</b>
        <span className="s">·</span>
        {scenario.workspace}
        <span className="s">·</span>
        {scenario.model}
        <span className="sp" />
        <span className={scenario.running ? "on" : ""}>{scenario.running ? "active" : "idle"}</span>
        <button disabled={!scenario.running} onClick={() => noop("abort")}>abort</button>
      </header>

      <div className="vN-scroll">
        {empty ? (
          <div className="vN-empty">
            <p><span>ready</span> — questions and runs live in dark console strips.<br />Answers break out into a light prose band between them.</p>
          </div>
        ) : (
          <>
            {groups.map((group, gi) =>
              group.kind === "prose" ? (
                <section className="vN-prose" key={group.item.id}>
                  <div className="vN-prose-in">
                    <Md source={group.item.content} className={scenario.streamingTail && gi === groups.length - 1 ? "p-caret" : ""} />
                  </div>
                </section>
              ) : (
                <section className="vN-strip" key={`strip-${gi}`}>
                  <div className="vN-strip-in">
                    {group.items.map((m) =>
                      m.role === "user" ? (
                        <div className="vN-line l-user" key={m.id}>
                          <span className="vN-ts">{m.ts}</span>
                          <span>›</span>
                          <span>{m.content}</span>
                        </div>
                      ) : (
                        <div key={m.id}>
                          <div className={`vN-line ${m.status === "running" ? "l-live" : "l-run"}`}>
                            <span className="vN-ts">{m.ts}</span>
                            <span>{m.status === "running" ? "◐" : "✓"}</span>
                            <strong>{m.toolName}</strong>
                            <em>{m.args}</em>
                            <span className="vN-tail">{m.status === "running" ? "running" : m.result?.split("\n")[0]}</span>
                          </div>
                          {m.result && m.result.includes("\n") && <pre className="vN-out">{m.result}</pre>}
                        </div>
                      ),
                    )}
                  </div>
                </section>
              ),
            )}

            {pending.map((a) => (
              <section className="vN-perm" key={a.request.id}>
                <div className="vN-perm-in">
                  <div className="vN-perm-h">? {approvalTitle(a.request.kind).toLowerCase()} — {a.request.toolName}</div>
                  {argLines(a.request.args).map(([k, v]) => (
                    <div className="vN-arg" key={k}><b>{k}</b><span>{v}</span></div>
                  ))}
                  <div className="vN-act">
                    <button className="vN-y" onClick={() => noop("approve")}>y — approve</button>
                    <button className="vN-n" onClick={() => noop("deny")}>n — deny</button>
                    <em>run parked until you answer</em>
                  </div>
                </div>
              </section>
            ))}

            {scenario.queued.length > 0 && (
              <section className="vN-strip">
                <div className="vN-strip-in">
                  {scenario.queued.map((q, i) => (
                    <div className="vN-line l-queue" key={q.id}>
                      <span className="vN-ts">q{i + 1}</span>
                      <span>»</span>
                      <em style={{ color: "#7b8496" }}>{q.message}</em>
                      <span className="vN-q-act">
                        <button onClick={() => noop("edit")}>edit</button>
                        <button onClick={() => noop("cancel")}>rm</button>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <div className="vN-foot">
        <div className="vN-foot-in">
          {scenario.error && <p className="vN-err">! {scenario.error}</p>}
          <div className="vN-composer">
            <span className="vN-caret">›</span>
            <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scenario.running ? "send to queue…" : "ask smith…"} />
            <button className="vN-send" onClick={() => noop("send")}>send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const variantN: Variant = {
  key: "N",
  name: "Console strips",
  note: "Questions and runs compress into dark edge-to-edge console strips; answers break out into a prose band.",
  Component,
};
