//! Agent loop: maintain history and run model -> tools -> model until the
//! model produces final text or the round limit is hit.
//!
//! The loop is UI-agnostic: progress is reported as [`AgentEvent`]s over a
//! channel and rendered by the TUI.

use anyhow::{Result, bail};
use serde_json::Value;
use tokio::sync::mpsc::UnboundedSender;

use crate::fireworks::{Completion, Message, ToolCall};
use crate::tools::Workspace;

pub const MAX_ROUNDS: usize = 12;

const SYSTEM_PROMPT: &str = "You are Smith, a read-only coding agent. You investigate the user's \
workspace with the list_files, read_file, and search_files tools before answering. All paths are \
relative to the workspace root. Ground every claim in file contents you actually inspected in \
this conversation, and cite the relevant relative file paths (with line numbers where useful). \
If you cannot find the answer in the workspace, say so plainly. Be concise.";

/// Progress reported while an agent run executes. `Done` and `Error` are
/// emitted by the task driving the run, the rest by the run itself.
#[derive(Debug, Clone)]
pub enum AgentEvent {
    /// A model round started; waiting on the API.
    Thinking,
    /// A chunk of visible answer text arrived.
    Delta(String),
    /// A tool started executing; the payload is a display status such as
    /// "Reading src/main.rs".
    ToolStart(String),
    /// The run finished successfully.
    Done,
    /// The run failed; the session history is still intact.
    Error(String),
}

/// Anything that can produce a streamed completion. Lets tests drive the
/// agent loop with scripted completions instead of the network.
pub trait ModelClient {
    fn stream_chat(
        &self,
        messages: &[Message],
        tools: &Value,
        on_content: &mut (dyn FnMut(&str) + Send),
    ) -> impl Future<Output = Result<Completion>>;
}

impl ModelClient for crate::fireworks::Client {
    fn stream_chat(
        &self,
        messages: &[Message],
        tools: &Value,
        on_content: &mut (dyn FnMut(&str) + Send),
    ) -> impl Future<Output = Result<Completion>> {
        crate::fireworks::Client::stream_chat(self, messages, tools, on_content)
    }
}

pub struct Agent<C: ModelClient> {
    client: C,
    workspace: Workspace,
    tools: Value,
    history: Vec<Message>,
}

impl<C: ModelClient> Agent<C> {
    pub fn new(client: C, workspace: Workspace) -> Self {
        Self {
            client,
            workspace,
            tools: crate::tools::schemas(),
            history: vec![Message::system(SYSTEM_PROMPT)],
        }
    }

    #[cfg(test)]
    pub fn history(&self) -> &[Message] {
        &self.history
    }

    /// Run one agent run: from a user prompt to a final answer, reporting
    /// progress as events. History is preserved even when the run fails, so
    /// the session can continue with the next prompt.
    pub async fn run(&mut self, prompt: &str, events: &UnboundedSender<AgentEvent>) -> Result<()> {
        self.history.push(Message::user(prompt));

        for _ in 0..MAX_ROUNDS {
            let _ = events.send(AgentEvent::Thinking);
            let mut streamed = false;
            let completion = {
                let streamed = &mut streamed;
                let mut on_content = move |text: &str| {
                    *streamed = true;
                    let _ = events.send(AgentEvent::Delta(text.to_string()));
                };
                self.client
                    .stream_chat(&self.history, &self.tools, &mut on_content)
                    .await?
            };

            if completion.tool_calls.is_empty() {
                if !streamed {
                    // Content that arrived without incremental deltas.
                    let text = if completion.content.is_empty() {
                        "(the model returned an empty response)".to_string()
                    } else {
                        completion.content.clone()
                    };
                    let _ = events.send(AgentEvent::Delta(text));
                }
                self.history.push(Message::assistant_text(completion.content));
                return Ok(());
            }

            self.history.push(Message::assistant_tool_calls(
                completion.content,
                completion.tool_calls.clone(),
            ));
            for call in &completion.tool_calls {
                let _ = events.send(AgentEvent::ToolStart(status_for(call)));
                let result = self.workspace.execute(&call.function.name, &call.function.arguments);
                self.history.push(Message::tool_result(call.id.clone(), result));
            }
        }

        bail!(
            "stopped after {MAX_ROUNDS} model rounds without a final answer; \
             the session is preserved, try a more specific prompt"
        )
    }
}

fn status_for(call: &ToolCall) -> String {
    let args: Value = serde_json::from_str(&call.function.arguments).unwrap_or(Value::Null);
    let arg = |key: &str| args.get(key).and_then(Value::as_str).unwrap_or(".").to_string();
    match call.function.name.as_str() {
        "list_files" => format!("Listing {}", arg("path")),
        "read_file" => format!("Reading {}", arg("path")),
        "search_files" => format!("Searching {:?} in {}", arg("query"), arg("path")),
        other => format!("Running {other}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fireworks::ToolCallFunction;
    use std::cell::RefCell;
    use std::collections::VecDeque;
    use std::fs;
    use tempfile::TempDir;
    use tokio::sync::mpsc::{UnboundedReceiver, unbounded_channel};

    /// Scripted client: pops one completion per model round and records the
    /// message list it was called with.
    struct MockClient {
        completions: RefCell<VecDeque<Completion>>,
        seen_messages: RefCell<Vec<Vec<Message>>>,
    }

    impl MockClient {
        fn new(completions: Vec<Completion>) -> Self {
            Self {
                completions: RefCell::new(completions.into()),
                seen_messages: RefCell::new(Vec::new()),
            }
        }
    }

    impl ModelClient for MockClient {
        async fn stream_chat(
            &self,
            messages: &[Message],
            _tools: &Value,
            on_content: &mut (dyn FnMut(&str) + Send),
        ) -> Result<Completion> {
            self.seen_messages.borrow_mut().push(messages.to_vec());
            let completion = self
                .completions
                .borrow_mut()
                .pop_front()
                .expect("mock ran out of scripted completions");
            if !completion.content.is_empty() {
                on_content(&completion.content);
            }
            Ok(completion)
        }
    }

    fn tool_call(id: &str, name: &str, arguments: &str) -> ToolCall {
        ToolCall {
            id: id.to_string(),
            kind: "function".to_string(),
            function: ToolCallFunction {
                name: name.to_string(),
                arguments: arguments.to_string(),
            },
        }
    }

    fn temp_workspace() -> (TempDir, Workspace) {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("notes.txt"), "the answer is 42\n").unwrap();
        let ws = Workspace::new(dir.path()).unwrap();
        (dir, ws)
    }

    fn drain(rx: &mut UnboundedReceiver<AgentEvent>) -> Vec<AgentEvent> {
        let mut events = Vec::new();
        while let Ok(event) = rx.try_recv() {
            events.push(event);
        }
        events
    }

    #[tokio::test]
    async fn runs_model_tool_model_without_network() {
        let (_dir, ws) = temp_workspace();
        let client = MockClient::new(vec![
            Completion {
                content: String::new(),
                tool_calls: vec![tool_call("call_1", "read_file", r#"{"path":"notes.txt"}"#)],
            },
            Completion {
                content: "The notes file says the answer is 42.".to_string(),
                tool_calls: vec![],
            },
        ]);
        let (tx, mut rx) = unbounded_channel();
        let mut agent = Agent::new(client, ws);
        agent.run("What do the notes say?", &tx).await.unwrap();

        // history: system, user, assistant tool_calls, tool result, assistant text
        let history = agent.history();
        assert_eq!(history.len(), 5);
        assert_eq!(history[2].role, "assistant");
        let calls = history[2].tool_calls.as_ref().unwrap();
        assert_eq!(calls[0].id, "call_1");
        assert_eq!(history[3].role, "tool");
        assert_eq!(history[3].tool_call_id.as_deref(), Some("call_1"));
        assert!(
            history[3].content.as_ref().unwrap().contains("the answer is 42"),
            "tool result should contain file content"
        );
        assert_eq!(history[4].role, "assistant");

        // The second model round must have seen the tool result.
        let seen = agent.client.seen_messages.borrow();
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[1].len(), 4);

        // Events: thinking, tool status, thinking, answer delta.
        let events = drain(&mut rx);
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::ToolStart(s) if s == "Reading notes.txt")),
            "expected a ToolStart event: {events:?}"
        );
        assert!(
            events
                .iter()
                .any(|e| matches!(e, AgentEvent::Delta(s) if s.contains("42"))),
            "expected the answer delta: {events:?}"
        );
    }

    #[tokio::test]
    async fn tool_errors_are_returned_to_the_model_not_fatal() {
        let (_dir, ws) = temp_workspace();
        let client = MockClient::new(vec![
            Completion {
                content: String::new(),
                tool_calls: vec![tool_call("call_1", "read_file", r#"{"path":"../etc"}"#)],
            },
            Completion {
                content: "That path is outside the workspace.".to_string(),
                tool_calls: vec![],
            },
        ]);
        let (tx, _rx) = unbounded_channel();
        let mut agent = Agent::new(client, ws);
        agent.run("Read ../etc", &tx).await.unwrap();
        let history = agent.history();
        assert!(history[3].content.as_ref().unwrap().starts_with("Error:"));
    }

    #[tokio::test]
    async fn aborts_after_round_limit_and_preserves_session() {
        let (_dir, ws) = temp_workspace();
        let completions = (0..MAX_ROUNDS)
            .map(|i| Completion {
                content: String::new(),
                tool_calls: vec![tool_call(
                    &format!("call_{i}"),
                    "list_files",
                    r#"{"path":"."}"#,
                )],
            })
            .collect();
        let client = MockClient::new(completions);
        let (tx, _rx) = unbounded_channel();
        let mut agent = Agent::new(client, ws);
        let err = agent.run("loop forever", &tx).await.unwrap_err().to_string();
        assert!(err.contains("12 model rounds"), "{err}");
        // System + user + 12 rounds of (assistant + tool result).
        assert_eq!(agent.history().len(), 2 + MAX_ROUNDS * 2);
    }
}
