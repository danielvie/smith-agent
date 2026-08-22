# PROTOTYPE — throwaway. Do not promote this code.

Ten layout variants of the Smith Agent browser UI, switchable via `?variant=` on a
throwaway route, driven by fixture data so every state in
`handoff/handoff-1-ui-visual-direction.md` can be inspected on demand.

Run:

    bun run src/web/prototype/serve.ts

Then open http://127.0.0.1:3211/ and use the floating bottom bar (or the arrow keys)
to cycle variants, and the scenario select to cycle states.

## Why fixtures instead of the live session

The brief asks for compositions of states a live agent will not produce on cue —
two pending approvals, three queued messages, an error at the composer. Fixtures
make each state one click away. No server, no API key, no persistence.

## Variants — gen 1 (A-J)

| Key | Name | The structural bet | Brief rule it tests |
|-----|------|--------------------|---------------------|
| A | Rail + header | Refined version of the shipped layout | The baseline to beat |
| B | Centered document | No rail at all; identity is a chip that opens a sheet | "Conversation is the product", taken literally |
| C | Margin notes | Tool activity and approvals live in a slim right gutter, aligned to their message | "Tool activity legible but subordinate" |
| D | Timeline spine | Every event is a node on one vertical spine | "What is Smith doing right now?" |
| E | Composer first | Composer is the anchor; queue lives inside its border; approvals morph the composer | "Sending is sending", one Send action |
| F | Focus pane | Right pane, collapsed until you open a tool result — deliberately breaks "no right panel" | Whether inline artifacts are enough |
| G | Editorial bands | Full-bleed alternating bands, no bubbles, tool runs as one-line disclosures | Density vs. breathing room |
| H | Top rail | Zero left rail; all chrome in one top bar | Maximum conversation share |
| I | Terminal | Monospace log; approvals block inline like a REPL y/n prompt | "Quietly technical" at its far end |
| J | Focus mode | Status reduced to a hairline; sidebar is a summoned overlay | "It should look good when almost empty" |

## Variants - gen 2 (K-R)

Descendants of D (timeline spine) crossed with G (full-bleed bands) and I (terminal
texture). Shared DNA in all eight: every event is a node on one spine, band fills carry
role, metadata and tool output are monospace, and approvals read as an inline y/n prompt.
They disagree about where the spine lives and how much room a node gets.

| Key | Name | Where the spine lives | What it costs |
|-----|------|----------------------|---------------|
| K | Spine through bands | Drawn continuously across the band fills, timestamps hanging left | Closest to D; bands make role obvious without cards |
| L | Ledger gutter | The spine IS a fixed monospace column: time, sigil, kind | The column is dead weight on narrow screens |
| M | Band as node | Each event is its own bordered block, chained by short segments | Most legible per-node, least continuous as a thread |
| N | Console strips | Only inside the dark strips; answers break out into a prose band | Two typographic worlds in one scroll |
| O | Changelog rules | Nowhere - hairline rules and a hanging margin replace it | Quietest; loses the at-a-glance run/answer distinction |
| P | Live tail | Same as K, plus a pinned tail strip for the running tool | Splits attention between history and the pinned tail |
| Q | Numbered steps | Ordinals are the nodes, including the one you are about to write | You can say "redo 04"; the numbers add visual noise |
| R | Two densities | Same spine at two densities, toggled in the top bar | A mode to learn, but digest makes long sessions scannable |

## Outcome

**R won, with Q's square node markers.** Promoted into `src/web/client.tsx` and
`src/web/styles.css` on 2026-08-22: one spine, banded nodes, terminal-textured tool
rows and inline approvals, with a Digest/Read toggle in the top bar. Round spine dots
were replaced by Q's 9px squares, colour-coded by role. Ordinals were not taken.

`verify.ts` in this directory serves the **real** `src/web/index.html` against a
scripted event stream, so the promoted layout can be checked in every state without an
agent, a model call, or an API key:

    bun run src/web/prototype/verify.ts

## Capture

When a variant wins: fold it into `src/web/client.tsx` properly (rewritten, not
copy-pasted), then move this whole directory onto a throwaway branch and delete it
from main.

## What the build already exposed

Recorded here so the findings survive even if the variants do not.

- **E hides the queue behind an approval.** In the `everything` scenario, E's composer
  is taken over by the permission check, so queued messages vanish while you decide.
  That is the honest cost of "the composer is the one surface" — the brief's success
  test asks "can I change or cancel the next message?" and E answers *not right now*.
- **C, F and H have no real narrow-viewport treatment.** Nothing overflows at 420px,
  but C's gutter and F's pane just compress. Each would need a genuine stacking rule.
- **The real client cannot render charts or LaTeX.** `renderMarkdown` in
  `src/web/client.tsx` uses `__SMITH_CHART_0__` as a placeholder; Markdown parses the
  surrounding double underscores as bold before the substitution runs, so the token is
  never found. This prototype uses `@@PCHART0@@` instead. Production is still broken.

### Gen 2

- **L spends 30% of a narrow viewport on timestamps.** Measured at 420px: the ledger
  column holds its 128px while the content column drops to 270px, and code blocks start
  scrolling horizontally. The ledger needs to collapse to a sigil below ~700px.
- **R's digest mode cuts the scroll by 38%.** Same fixture, 943px of content becomes
  580px. Approvals stay expanded in digest by design — a collapsed permission check
  would be the one thing you cannot skim past.
- **O drops the y/n texture on purpose.** It is the only gen-2 variant without terminal
  sigils in the margin, to test whether the rules alone carry the structure. Compare it
  against K back to back; that is the actual question O is asking.
