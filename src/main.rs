//! Smith Agent PoC: interactive read-only coding agent on Fireworks AI,
//! presented as a full-screen terminal UI.

mod agent;
mod fireworks;
mod tools;
mod tui;

use std::path::Path;

use anyhow::{Context, Result, anyhow};

use agent::Agent;
use fireworks::Client;
use tools::Workspace;

#[tokio::main]
async fn main() {
    if let Err(err) = run().await {
        eprintln!("error: {err:#}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let api_key = std::env::var("API_KEY_FIREWORKS").map_err(|_| {
        anyhow!(
            "API_KEY_FIREWORKS is not set. In PowerShell run: \
             $env:API_KEY_FIREWORKS = \"<your Fireworks API key>\""
        )
    })?;
    let cwd = std::env::current_dir().context("cannot determine the current directory")?;
    let workspace = Workspace::new(&cwd)?;
    let workspace_display = display_path(workspace.root());
    let client = Client::new(api_key)?;
    let agent = Agent::new(client, workspace);
    tui::run(agent, workspace_display).await
}

/// Strip the Windows verbatim prefix (`\\?\`) for readable display.
fn display_path(path: &Path) -> String {
    let text = path.display().to_string();
    text.strip_prefix(r"\\?\").unwrap_or(&text).to_string()
}
