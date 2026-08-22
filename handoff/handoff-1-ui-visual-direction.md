# UI visual direction for Smith Agent

## Purpose

This handoff is a visual and interaction brief for an artist working on the Smith Agent browser UI. It describes the intended product feeling and the layout priorities. The current implementation is the promoted B layout in `src/web/client.tsx` and `src/web/styles.css`.

## Product in one sentence

Smith Agent is a local project assistant that can inspect a workspace, explain what it finds, and make approved changes through a live conversation.

## The feeling we want

The UI should feel:

- Calm under pressure.
- Focused on the user's work, not on the tool itself.
- Capable without feeling aggressive or magical.
- Trustworthy around actions that can change files or run commands.
- Quietly technical, with the clarity of a good editor rather than the spectacle of a control room.

The user should feel that there is one competent assistant working beside them. They should not feel that they are operating a dashboard full of subsystems.

A useful reference is a focused writing surface with an unobtrusive project rail. It can have the density of a developer tool, but it should retain the breathing room and hierarchy of a well-designed editorial interface.

## Core layout goal

Conversation is the product. Give it roughly 70 to 80 percent of the available space.

The primary composition is:

1. A narrow left rail for identity and configuration.
2. A compact status header over the conversation.
3. A large central transcript for user messages, assistant responses, tool activity, code, charts, and rich Markdown.
4. A composer that is always visible at the bottom of the conversation.

The left rail should collapse to a small icon strip. Collapsing it should give the conversation more room without changing the user's place in the thread.

There should be no large, permanently reserved panel for approvals. Empty state should belong to the conversation, not to a collection of empty dashboard cards.

## Interaction principles

### Conversation first

The transcript is the visual center of gravity. Streaming text should be easy to follow. Tool activity should be legible but subordinate to the assistant's response. Code blocks, Markdown, charts, and LaTeX should feel like native parts of the conversation.

### One Send action

There is one mental model for messages:

- If the thread is idle, `Send` starts the message immediately.
- If the thread is running, `Send` places the message in a visible queue.
- When the current run finishes, queued messages execute in order.

The user should never have to understand separate concepts such as "prompt" versus "follow-up". Sending is sending.

### Queued messages are pending work

When messages are waiting, show them immediately above the composer in a compact pending state. The visual treatment should answer three questions without explanation:

- What text is waiting?
- Is it running yet?
- Can I change or remove it?

Each queued message needs clear `Edit` and `Cancel` actions. Editing should bring the message back into the composer so the user can revise it before sending again.

Queued messages should not look like completed conversation messages. They are pending work, not history.

### Approvals are interruptions, not navigation

Approvals exist to protect the workspace. They are needed for operations such as writing files, editing files, or running shell commands.

When there is nothing to approve, the approval UI should disappear entirely. Do not reserve space for it in the sidebar or show an empty "Approvals" card.

When a request appears, it should surface inline near the composer or current conversation context. It should be noticeable and easy to understand, but it should not turn the whole interface into a security console. Show the requested operation, the relevant arguments, and the two decisions: approve or deny.

An approval should feel like a clear permission check, not an alarm.

## Visual direction

Use a dark, restrained palette with one cool action accent and a warm attention color for running or approval states. The existing CSS palette is a useful starting point, but the artist should improve hierarchy and proportion rather than preserve every value.

Priorities:

- Strong contrast for text and actions.
- Muted surfaces instead of many competing cards.
- Generous spacing around the transcript.
- Clear distinction between user, assistant, tool, system, queued, and approval states.
- Typography that makes long responses and code comfortable to read.
- Buttons that look deliberate and quiet until an action is needed.
- Subtle borders and elevation. Avoid glossy panels and decorative effects.

The interface should look good when almost empty. It should also remain understandable when a response is streaming, several tools have run, an approval is pending, and two messages are queued.

## States the artist should design

At minimum, provide compositions for:

- Empty, ready workspace.
- Active run with streaming assistant text.
- Tool activity during a run.
- One pending approval.
- Multiple pending approvals.
- One queued message.
- Several queued messages with edit and cancel actions.
- An error at the composer or transcript.
- Collapsed and expanded sidebar.
- Narrow viewport or mobile layout.

The state changes should be obvious through small, consistent signals. Avoid large layout jumps whenever possible.

## Things to avoid

- A dashboard or admin-console feeling.
- A large permanent right-hand information panel.
- Empty approval or session cards.
- A neon cyberpunk treatment.
- Excessive glass, gradients, glow, or ornamental animation.
- Status badges competing with the conversation.
- Making the user inspect a separate area to understand whether a message is queued or running.
- Treating queued messages as if they were already executed.
- Hiding the composer while the assistant is working.
- Copy that sounds theatrical, anthropomorphic, or promotional.

## Success test

A first-time user should be able to answer these questions at a glance:

- Where do I talk to Smith?
- What is Smith doing right now?
- Is my message running, waiting, or finished?
- Why did Smith stop and ask me something?
- Can I change or cancel the next message?
- How do I get more room for the conversation?

If the answer to any of these requires opening a dashboard panel or learning a new mode, the layout is too complicated.

## Implementation references

- Current UI structure: `src/web/client.tsx`
- Current layout and state styling: `src/web/styles.css`
- Browser behavior and local UI entry point: `src/server.ts`
- App-owned event and queue types: `src/protocol.ts`
- User-facing project overview: `README.md`

## Suggested skills

- `shared-understanding`: align visual decisions with the product behavior and user expectations.
- `prototype`: explore alternate compositions and state transitions before committing to a final layout.
- `how`: trace the browser event flow when a visual state needs to map to runtime behavior.
- `unslop`: keep UI copy direct, calm, and free of generic assistant language.
