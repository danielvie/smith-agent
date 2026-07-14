//! Full-screen terminal UI built on ratatui.
//!
//! Layout: header, scrollable transcript, colored status line, input box.
//! The agent runs on its own task; the UI reacts to [`AgentEvent`]s so
//! streamed text and tool activity render live.

use std::time::Duration;

use anyhow::{Context, Result};
use crossterm::event::{Event, EventStream, KeyCode, KeyEvent, KeyEventKind, KeyModifiers};
use futures_util::StreamExt;
use ratatui::{
    DefaultTerminal, Frame,
    layout::{Constraint, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span, Text},
    widgets::{Block, Padding, Paragraph, Wrap},
};
use tokio::sync::mpsc;

use crate::agent::{Agent, AgentEvent};
use crate::fireworks;

const SPINNER: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TICK: Duration = Duration::from_millis(100);

pub async fn run(agent: Agent<fireworks::Client>, workspace: String) -> Result<()> {
    let terminal = ratatui::try_init()
        .context("failed to initialize the terminal (an interactive terminal is required)")?;
    let result = App::new(workspace).event_loop(terminal, agent).await;
    ratatui::restore();
    result
}

enum Status {
    Idle,
    Thinking,
    Tool(String),
}

struct App {
    workspace: String,
    /// Finished transcript lines with their styling.
    transcript: Vec<Line<'static>>,
    /// Answer text currently streaming in, not yet frozen into `transcript`.
    stream_buf: String,
    input: Vec<char>,
    cursor: usize,
    /// 0 = pinned to the newest output.
    scroll_from_bottom: u16,
    /// Transcript viewport height from the last draw, for page scrolling.
    transcript_height: u16,
    status: Status,
    spinner: usize,
    running: bool,
    quit: bool,
}

impl App {
    fn new(workspace: String) -> Self {
        Self {
            workspace,
            transcript: vec![Line::from(Span::styled(
                "Ask a question about this workspace. /exit or Ctrl+C quits.",
                Style::new().add_modifier(Modifier::DIM),
            ))],
            stream_buf: String::new(),
            input: Vec::new(),
            cursor: 0,
            scroll_from_bottom: 0,
            transcript_height: 1,
            status: Status::Idle,
            spinner: 0,
            running: false,
            quit: false,
        }
    }

    async fn event_loop(
        mut self,
        mut terminal: DefaultTerminal,
        agent: Agent<fireworks::Client>,
    ) -> Result<()> {
        let (prompt_tx, mut prompt_rx) = mpsc::unbounded_channel::<String>();
        let (event_tx, mut event_rx) = mpsc::unbounded_channel::<AgentEvent>();
        tokio::spawn(async move {
            let mut agent = agent;
            while let Some(prompt) = prompt_rx.recv().await {
                let outcome = agent.run(&prompt, &event_tx).await;
                let _ = event_tx.send(match outcome {
                    Ok(()) => AgentEvent::Done,
                    Err(err) => AgentEvent::Error(format!("{err:#}")),
                });
            }
        });

        let mut terminal_events = EventStream::new();
        let mut ticker = tokio::time::interval(TICK);
        while !self.quit {
            terminal.draw(|frame| self.draw(frame))?;
            tokio::select! {
                maybe_event = terminal_events.next() => {
                    match maybe_event {
                        Some(Ok(Event::Key(key))) => self.on_key(key, &prompt_tx),
                        Some(Ok(_)) => {} // resize etc: redraw on the next pass
                        Some(Err(err)) => return Err(err).context("failed to read terminal events"),
                        None => break,
                    }
                }
                Some(event) = event_rx.recv() => {
                    self.on_agent_event(event);
                    // Batch whatever else already arrived before redrawing.
                    while let Ok(event) = event_rx.try_recv() {
                        self.on_agent_event(event);
                    }
                }
                _ = ticker.tick() => {
                    self.spinner = self.spinner.wrapping_add(1);
                }
            }
        }
        Ok(())
    }

    // --- input handling ---

    fn on_key(&mut self, key: KeyEvent, prompt_tx: &mpsc::UnboundedSender<String>) {
        if key.kind != KeyEventKind::Press {
            return;
        }
        if key.modifiers.contains(KeyModifiers::CONTROL) {
            if matches!(key.code, KeyCode::Char('c') | KeyCode::Char('C')) {
                self.quit = true;
            }
            return;
        }
        match key.code {
            KeyCode::Enter => self.submit(prompt_tx),
            KeyCode::Char(c) => {
                self.input.insert(self.cursor, c);
                self.cursor += 1;
            }
            KeyCode::Backspace => {
                if self.cursor > 0 {
                    self.cursor -= 1;
                    self.input.remove(self.cursor);
                }
            }
            KeyCode::Delete => {
                if self.cursor < self.input.len() {
                    self.input.remove(self.cursor);
                }
            }
            KeyCode::Left => self.cursor = self.cursor.saturating_sub(1),
            KeyCode::Right => self.cursor = (self.cursor + 1).min(self.input.len()),
            KeyCode::Home => self.cursor = 0,
            KeyCode::End => self.cursor = self.input.len(),
            KeyCode::Up => self.scroll_from_bottom = self.scroll_from_bottom.saturating_add(1),
            KeyCode::Down => self.scroll_from_bottom = self.scroll_from_bottom.saturating_sub(1),
            KeyCode::PageUp => {
                self.scroll_from_bottom =
                    self.scroll_from_bottom.saturating_add(self.transcript_height)
            }
            KeyCode::PageDown => {
                self.scroll_from_bottom =
                    self.scroll_from_bottom.saturating_sub(self.transcript_height)
            }
            KeyCode::Esc => self.scroll_from_bottom = 0,
            _ => {}
        }
    }

    fn submit(&mut self, prompt_tx: &mpsc::UnboundedSender<String>) {
        let text: String = self.input.iter().collect();
        let text = text.trim().to_string();
        if text.is_empty() {
            return;
        }
        if text == "/exit" {
            self.quit = true;
            return;
        }
        if self.running {
            return; // one run at a time; input stays editable meanwhile
        }
        self.input.clear();
        self.cursor = 0;
        self.transcript.push(Line::default());
        self.transcript.push(Line::from(vec![
            Span::styled("❯ ", Style::new().fg(Color::Cyan).add_modifier(Modifier::BOLD)),
            Span::styled(text.clone(), Style::new().add_modifier(Modifier::BOLD)),
        ]));
        self.running = true;
        self.status = Status::Thinking;
        self.scroll_from_bottom = 0;
        let _ = prompt_tx.send(text);
    }

    // --- agent events ---

    fn on_agent_event(&mut self, event: AgentEvent) {
        match event {
            AgentEvent::Thinking => self.status = Status::Thinking,
            AgentEvent::Delta(text) => self.stream_buf.push_str(&text),
            AgentEvent::ToolStart(status) => {
                self.freeze_stream();
                self.transcript.push(Line::from(Span::styled(
                    format!("• {status}"),
                    Style::new().fg(Color::Yellow),
                )));
                self.status = Status::Tool(status);
            }
            AgentEvent::Done => {
                self.freeze_stream();
                self.finish_run();
            }
            AgentEvent::Error(message) => {
                self.freeze_stream();
                self.transcript.push(Line::from(Span::styled(
                    format!("✗ {message}"),
                    Style::new().fg(Color::Red),
                )));
                self.finish_run();
            }
        }
    }

    fn finish_run(&mut self) {
        self.running = false;
        self.status = Status::Idle;
    }

    /// Move the streaming buffer into the fixed transcript.
    fn freeze_stream(&mut self) {
        if self.stream_buf.is_empty() {
            return;
        }
        for line in self.stream_buf.split('\n') {
            self.transcript.push(Line::raw(line.to_string()));
        }
        self.stream_buf.clear();
    }

    // --- rendering ---

    fn draw(&mut self, frame: &mut Frame) {
        let [header_area, transcript_area, status_area, input_area] = Layout::vertical([
            Constraint::Length(2),
            Constraint::Min(1),
            Constraint::Length(1),
            Constraint::Length(3),
        ])
        .areas(frame.area());
        self.transcript_height = transcript_area.height;

        self.draw_header(frame, header_area);
        self.draw_transcript(frame, transcript_area);
        self.draw_status(frame, status_area);
        self.draw_input(frame, input_area);
    }

    fn draw_header(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let lines = vec![
            Line::from(vec![
                Span::styled(
                    " Smith Agent ",
                    Style::new()
                        .fg(Color::Black)
                        .bg(Color::Cyan)
                        .add_modifier(Modifier::BOLD),
                ),
                Span::styled(" read-only · ", Style::new().add_modifier(Modifier::DIM)),
                Span::styled(fireworks::MODEL, Style::new().fg(Color::Magenta)),
            ]),
            Line::from(Span::styled(
                format!(" workspace: {}", self.workspace),
                Style::new().add_modifier(Modifier::DIM),
            )),
        ];
        frame.render_widget(Paragraph::new(lines), area);
    }

    fn draw_transcript(&mut self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let mut lines = self.transcript.clone();
        if !self.stream_buf.is_empty() {
            for chunk in self.stream_buf.split('\n') {
                lines.push(Line::raw(chunk.to_string()));
            }
        }
        let paragraph = Paragraph::new(Text::from(lines)).wrap(Wrap { trim: false });
        let total = paragraph.line_count(area.width) as u16;
        let max_scroll = total.saturating_sub(area.height);
        self.scroll_from_bottom = self.scroll_from_bottom.min(max_scroll);
        let offset = max_scroll - self.scroll_from_bottom;
        frame.render_widget(paragraph.scroll((offset, 0)), area);
    }

    fn draw_status(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        let frame_char = SPINNER[self.spinner % SPINNER.len()];
        let status = match &self.status {
            Status::Idle => Span::styled(
                " ready",
                Style::new().fg(Color::Green).add_modifier(Modifier::DIM),
            ),
            Status::Thinking => Span::styled(
                format!(" {frame_char} Thinking..."),
                Style::new().fg(Color::Magenta).add_modifier(Modifier::BOLD),
            ),
            Status::Tool(action) => Span::styled(
                format!(" {frame_char} {action}"),
                Style::new().fg(Color::Yellow).add_modifier(Modifier::BOLD),
            ),
        };
        let hints = "Enter send · ↑/↓ PgUp/PgDn scroll · Esc latest · Ctrl+C quit ";
        let [left, right] =
            Layout::horizontal([Constraint::Min(0), Constraint::Length(hints.len() as u16)])
                .areas(area);
        frame.render_widget(Paragraph::new(Line::from(status)), left);
        frame.render_widget(
            Paragraph::new(Line::from(Span::styled(
                hints,
                Style::new().add_modifier(Modifier::DIM),
            ))),
            right,
        );
    }

    fn draw_input(&self, frame: &mut Frame, area: ratatui::layout::Rect) {
        // A background one step lighter than the terminal's, no borders;
        // one cell of padding on every side.
        let background = Style::new().bg(Color::Rgb(56, 60, 70));
        let block = Block::new().style(background).padding(Padding::uniform(1));
        let inner = block.inner(area);
        let prompt = "> ";
        let width = (inner.width as usize).saturating_sub(prompt.len()).max(1);
        // Keep the cursor visible when the input outgrows the box.
        let start = (self.cursor + 1).saturating_sub(width);
        let visible: Vec<char> = self.input.iter().skip(start).take(width).copied().collect();
        // The hardware terminal cursor stays hidden (it blinks and flickers
        // on every redraw); draw a steady reversed-video block instead.
        let at = self.cursor - start;
        let before: String = visible[..at].iter().collect();
        let under: String = visible.get(at).map_or_else(|| " ".to_string(), char::to_string);
        let after: String = visible.get(at + 1..).map_or_else(String::new, |s| s.iter().collect());
        let line = Line::from(vec![
            Span::styled(
                prompt,
                Style::new().fg(Color::Rgb(170, 130, 255)).add_modifier(Modifier::BOLD),
            ),
            Span::raw(before),
            Span::styled(under, Style::new().add_modifier(Modifier::REVERSED)),
            Span::raw(after),
        ]);
        frame.render_widget(Paragraph::new(line).block(block), area);
    }
}
