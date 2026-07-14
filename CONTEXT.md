# Smith Agent

Smith Agent is a command-line coding assistant that investigates a local codebase in response to a user's request.

## Language

**Coding Agent**:
An assistant that autonomously investigates a codebase using available tools before answering a user's request.
_Avoid_: Chat client, chatbot

**Agent Run**:
One user request and the complete sequence of investigation steps and model responses required to produce its final answer.
_Avoid_: Query, chat

**Interactive Session**:
A sequence of agent runs sharing in-memory conversation context within one CLI process.
_Avoid_: Saved session, one-shot invocation
