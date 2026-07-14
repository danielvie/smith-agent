//! Fireworks OpenAI-compatible chat-completions client with SSE streaming.

use std::collections::BTreeMap;
use std::time::Duration;

use anyhow::{Context, Result, bail};
use eventsource_stream::Eventsource;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MODEL: &str = "accounts/fireworks/models/kimi-k2p6";
pub const BASE_URL: &str = "https://api.fireworks.ai/inference/v1";
/// Fireworks recommends a long read timeout for Kimi K2 agentic calls;
/// the PoC bounds failures at 10 minutes.
const READ_TIMEOUT: Duration = Duration::from_secs(600);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolCallFunction {
    pub name: String,
    pub arguments: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: ToolCallFunction,
}

#[derive(Serialize, Clone, Debug)]
pub struct Message {
    pub role: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl Message {
    fn new(role: &'static str, content: impl Into<String>) -> Self {
        Self {
            role,
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn system(content: impl Into<String>) -> Self {
        Self::new("system", content)
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self::new("user", content)
    }

    pub fn assistant_text(content: impl Into<String>) -> Self {
        Self::new("assistant", content)
    }

    pub fn assistant_tool_calls(content: String, tool_calls: Vec<ToolCall>) -> Self {
        Self {
            role: "assistant",
            content: if content.is_empty() { None } else { Some(content) },
            tool_calls: Some(tool_calls),
            tool_call_id: None,
        }
    }

    pub fn tool_result(tool_call_id: String, content: String) -> Self {
        Self {
            role: "tool",
            content: Some(content),
            tool_calls: None,
            tool_call_id: Some(tool_call_id),
        }
    }
}

/// A fully assembled model turn: final text and/or complete tool calls.
#[derive(Debug, Clone)]
pub struct Completion {
    pub content: String,
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Serialize)]
struct StreamOptions {
    include_usage: bool,
    include_internal_content: bool,
}

#[derive(Serialize)]
struct ChatRequest<'a> {
    model: &'a str,
    stream: bool,
    stream_options: StreamOptions,
    tool_choice: &'a str,
    parallel_tool_calls: bool,
    temperature: f32,
    max_tokens: u32,
    messages: &'a [Message],
    tools: &'a Value,
}

// --- SSE chunk shapes (unknown fields are ignored) ---

#[derive(Deserialize)]
struct ChunkEvent {
    #[serde(default)]
    choices: Vec<ChunkChoice>,
}

#[derive(Deserialize)]
struct ChunkChoice {
    #[serde(default)]
    delta: ChunkDelta,
}

#[derive(Deserialize, Default)]
struct ChunkDelta {
    content: Option<String>,
    tool_calls: Option<Vec<ToolCallDelta>>,
}

#[derive(Deserialize)]
struct ToolCallDelta {
    index: u32,
    id: Option<String>,
    function: Option<FunctionDelta>,
}

#[derive(Deserialize)]
struct FunctionDelta {
    name: Option<String>,
    arguments: Option<String>,
}

/// Accumulates streamed deltas into final text and complete tool calls.
///
/// Tool calls are keyed by their streamed `index` because IDs, names, and
/// JSON argument strings can arrive split across many chunks.
#[derive(Default)]
pub struct Assembler {
    content: String,
    calls: BTreeMap<u32, PartialCall>,
}

#[derive(Default)]
struct PartialCall {
    id: String,
    name: String,
    arguments: String,
}

impl Assembler {
    /// Feed one SSE `data:` payload. Returns any new visible text.
    pub fn feed(&mut self, data: &str) -> Result<Option<String>> {
        let chunk: ChunkEvent = serde_json::from_str(data)
            .with_context(|| format!("malformed stream event: {data}"))?;
        let mut visible = String::new();
        for choice in chunk.choices {
            if let Some(text) = choice.delta.content {
                self.content.push_str(&text);
                visible.push_str(&text);
            }
            for delta in choice.delta.tool_calls.unwrap_or_default() {
                let call = self.calls.entry(delta.index).or_default();
                if let Some(id) = delta.id {
                    call.id.push_str(&id);
                }
                if let Some(function) = delta.function {
                    if let Some(name) = function.name {
                        call.name.push_str(&name);
                    }
                    if let Some(arguments) = function.arguments {
                        call.arguments.push_str(&arguments);
                    }
                }
            }
        }
        Ok((!visible.is_empty()).then_some(visible))
    }

    pub fn finish(self) -> Result<Completion> {
        let mut tool_calls = Vec::new();
        for (index, call) in self.calls {
            if call.id.is_empty() || call.name.is_empty() {
                bail!("incomplete streamed tool call at index {index}");
            }
            tool_calls.push(ToolCall {
                id: call.id,
                kind: "function".to_string(),
                function: ToolCallFunction {
                    name: call.name,
                    arguments: if call.arguments.is_empty() {
                        "{}".to_string()
                    } else {
                        call.arguments
                    },
                },
            });
        }
        Ok(Completion {
            content: self.content,
            tool_calls,
        })
    }
}

pub struct Client {
    http: reqwest::Client,
    api_key: String,
    base_url: String,
}

impl Client {
    pub fn new(api_key: String) -> Result<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .read_timeout(READ_TIMEOUT)
            .build()
            .context("failed to build HTTP client")?;
        Ok(Self {
            http,
            api_key,
            base_url: BASE_URL.to_string(),
        })
    }

    /// Stream one chat completion. `on_content` receives visible text deltas
    /// as they arrive; the assembled completion is returned at the end.
    pub async fn stream_chat(
        &self,
        messages: &[Message],
        tools: &Value,
        on_content: &mut (dyn FnMut(&str) + Send),
    ) -> Result<Completion> {
        let request = ChatRequest {
            model: MODEL,
            stream: true,
            stream_options: StreamOptions {
                include_usage: true,
                include_internal_content: false,
            },
            tool_choice: "auto",
            parallel_tool_calls: false,
            temperature: 0.1,
            max_tokens: 1024,
            messages,
            tools,
        };
        let response = self
            .http
            .post(format!("{}/chat/completions", self.base_url))
            .bearer_auth(&self.api_key)
            .json(&request)
            .send()
            .await
            .context("request to Fireworks failed")?;
        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            let body = body.chars().take(500).collect::<String>();
            bail!("Fireworks API returned {status}: {body}");
        }

        let mut assembler = Assembler::default();
        let mut events = response.bytes_stream().eventsource();
        while let Some(event) = events.next().await {
            let event = event.context("failed to read the response stream")?;
            if event.data.trim() == "[DONE]" {
                break;
            }
            if let Some(text) = assembler.feed(&event.data)? {
                on_content(&text);
            }
        }
        assembler.finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn assembles_text_content_and_reports_deltas() {
        let mut a = Assembler::default();
        let first = a
            .feed(r#"{"choices":[{"delta":{"role":"assistant","content":"Hello"},"finish_reason":null}]}"#)
            .unwrap();
        assert_eq!(first.as_deref(), Some("Hello"));
        let second = a
            .feed(r#"{"choices":[{"delta":{"content":", world"},"finish_reason":null}]}"#)
            .unwrap();
        assert_eq!(second.as_deref(), Some(", world"));
        let completion = a.finish().unwrap();
        assert_eq!(completion.content, "Hello, world");
        assert!(completion.tool_calls.is_empty());
    }

    #[test]
    fn assembles_tool_call_split_across_chunks() {
        let mut a = Assembler::default();
        a.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc","type":"function","function":{"name":"read_file","arguments":""}}]},"finish_reason":null}]}"#,
        )
        .unwrap();
        a.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"pa"}}]},"finish_reason":null}]}"#,
        )
        .unwrap();
        a.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\":\"src/main.rs\"}"}}]},"finish_reason":"tool_calls"}]}"#,
        )
        .unwrap();
        let completion = a.finish().unwrap();
        assert!(completion.content.is_empty());
        assert_eq!(completion.tool_calls.len(), 1);
        let call = &completion.tool_calls[0];
        assert_eq!(call.id, "call_abc");
        assert_eq!(call.function.name, "read_file");
        let args: Value = serde_json::from_str(&call.function.arguments).unwrap();
        assert_eq!(args["path"], "src/main.rs");
    }

    #[test]
    fn assembles_multiple_indexed_tool_calls() {
        let mut a = Assembler::default();
        a.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"list_files","arguments":"{\"path\":\".\"}"}}]}}]}"#,
        )
        .unwrap();
        a.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":1,"id":"call_2","function":{"name":"read_file","arguments":"{\"path\":\"a.txt\"}"}}]}}]}"#,
        )
        .unwrap();
        let completion = a.finish().unwrap();
        assert_eq!(completion.tool_calls.len(), 2);
        assert_eq!(completion.tool_calls[0].function.name, "list_files");
        assert_eq!(completion.tool_calls[1].function.name, "read_file");
    }

    #[test]
    fn tolerates_usage_chunk_without_choices() {
        let mut a = Assembler::default();
        let out = a
            .feed(r#"{"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}"#)
            .unwrap();
        assert!(out.is_none());
    }

    #[test]
    fn malformed_event_is_an_error_not_a_panic() {
        let mut a = Assembler::default();
        let err = a.feed("this is not json").unwrap_err().to_string();
        assert!(err.contains("malformed stream event"), "{err}");
    }

    #[test]
    fn incomplete_tool_call_is_an_error() {
        let mut a = Assembler::default();
        a.feed(
            r#"{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{}"}}]}}]}"#,
        )
        .unwrap();
        assert!(a.finish().is_err());
    }

    #[test]
    fn tool_messages_serialize_with_matching_ids() {
        let msg = Message::tool_result("call_9".into(), "ok".into());
        let json = serde_json::to_value(&msg).unwrap();
        assert_eq!(json["role"], "tool");
        assert_eq!(json["tool_call_id"], "call_9");
        assert_eq!(json["content"], "ok");
        assert!(json.get("tool_calls").is_none());
    }
}
