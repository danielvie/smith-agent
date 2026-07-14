//! Read-only tools confined to the workspace root.
//!
//! Model-generated arguments are untrusted: every path is validated against
//! the canonical workspace root before any filesystem access.

use std::fs;
use std::path::{Component, Path, PathBuf};

use anyhow::{Context, Result, bail};
use serde_json::{Value, json};
use walkdir::WalkDir;

pub const MAX_FILE_BYTES: u64 = 128 * 1024;
pub const MAX_LIST_PATHS: usize = 500;
pub const MAX_SEARCH_MATCHES: usize = 100;
const MAX_LINE_CHARS: usize = 400;
const SKIPPED_DIRS: [&str; 2] = [".git", "target"];

pub struct Workspace {
    root: PathBuf,
}

impl Workspace {
    pub fn new(root: &Path) -> Result<Self> {
        let root = root
            .canonicalize()
            .with_context(|| format!("cannot canonicalize workspace root {}", root.display()))?;
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Validate an untrusted relative path and resolve it inside the root.
    fn resolve(&self, raw: &str) -> Result<PathBuf> {
        let path = Path::new(raw);
        for component in path.components() {
            match component {
                Component::Prefix(_) | Component::RootDir => {
                    bail!("absolute paths are not allowed: {raw}")
                }
                Component::ParentDir => bail!("\"..\" traversal is not allowed: {raw}"),
                Component::Normal(_) | Component::CurDir => {}
            }
        }
        let joined = self.root.join(path);
        // Canonicalizing resolves symlinks, so a link pointing outside the
        // workspace fails the starts_with check below.
        let canonical = joined
            .canonicalize()
            .with_context(|| format!("path not found: {raw}"))?;
        if !canonical.starts_with(&self.root) {
            bail!("path escapes the workspace: {raw}");
        }
        Ok(canonical)
    }

    fn relative_display(&self, path: &Path) -> String {
        let rel = path.strip_prefix(&self.root).unwrap_or(path);
        rel.to_string_lossy().replace('\\', "/")
    }

    pub fn list_files(&self, path: &str) -> Result<String> {
        let dir = self.resolve(path)?;
        if !dir.is_dir() {
            bail!("not a directory: {path}");
        }
        let mut paths = Vec::new();
        let mut truncated = false;
        let walker = WalkDir::new(&dir)
            .follow_links(false)
            .sort_by_file_name()
            .into_iter()
            .filter_entry(|e| !is_skipped_dir(e.file_type().is_dir(), e.file_name()));
        for entry in walker {
            let entry = entry.context("failed to walk directory")?;
            if !entry.file_type().is_file() {
                continue;
            }
            if paths.len() >= MAX_LIST_PATHS {
                truncated = true;
                break;
            }
            paths.push(self.relative_display(entry.path()));
        }
        if paths.is_empty() {
            return Ok(format!("(no files under {path})"));
        }
        let mut out = paths.join("\n");
        if truncated {
            out.push_str(&format!(
                "\n[truncated: only the first {MAX_LIST_PATHS} files are shown]"
            ));
        }
        Ok(out)
    }

    pub fn read_file(&self, path: &str) -> Result<String> {
        let file = self.resolve(path)?;
        if file.is_dir() {
            bail!("{path} is a directory, not a file");
        }
        let metadata = fs::metadata(&file).with_context(|| format!("cannot stat {path}"))?;
        if metadata.len() > MAX_FILE_BYTES {
            bail!(
                "{path} is {} bytes; files over {MAX_FILE_BYTES} bytes cannot be read",
                metadata.len()
            );
        }
        let bytes = fs::read(&file).with_context(|| format!("cannot read {path}"))?;
        let text = String::from_utf8(bytes)
            .map_err(|_| anyhow::anyhow!("{path} is not UTF-8 text (binary files are not supported)"))?;
        let mut out = String::new();
        for (i, line) in text.lines().enumerate() {
            out.push_str(&format!("{:>5}  {}\n", i + 1, clip_line(line)));
        }
        if out.is_empty() {
            out.push_str("(empty file)");
        }
        Ok(out)
    }

    pub fn search_files(&self, query: &str, path: &str) -> Result<String> {
        if query.is_empty() {
            bail!("query must not be empty");
        }
        let start = self.resolve(path)?;
        let mut matches = Vec::new();
        let mut truncated = false;
        let walker = WalkDir::new(&start)
            .follow_links(false)
            .sort_by_file_name()
            .into_iter()
            .filter_entry(|e| !is_skipped_dir(e.file_type().is_dir(), e.file_name()));
        'files: for entry in walker {
            let entry = entry.context("failed to walk directory")?;
            if !entry.file_type().is_file() {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            if metadata.len() > MAX_FILE_BYTES {
                continue;
            }
            let Ok(bytes) = fs::read(entry.path()) else {
                continue;
            };
            let Ok(text) = String::from_utf8(bytes) else {
                continue;
            };
            let rel = self.relative_display(entry.path());
            for (i, line) in text.lines().enumerate() {
                if line.contains(query) {
                    if matches.len() >= MAX_SEARCH_MATCHES {
                        truncated = true;
                        break 'files;
                    }
                    matches.push(format!("{rel}:{}: {}", i + 1, clip_line(line.trim_end())));
                }
            }
        }
        if matches.is_empty() {
            return Ok(format!("(no matches for {query:?} under {path})"));
        }
        let mut out = matches.join("\n");
        if truncated {
            out.push_str(&format!(
                "\n[truncated: only the first {MAX_SEARCH_MATCHES} matches are shown]"
            ));
        }
        Ok(out)
    }

    /// Dispatch a tool call. Failures become result text for the model
    /// instead of ending the CLI.
    pub fn execute(&self, name: &str, raw_arguments: &str) -> String {
        match self.try_execute(name, raw_arguments) {
            Ok(result) => result,
            Err(err) => format!("Error: {err:#}"),
        }
    }

    fn try_execute(&self, name: &str, raw_arguments: &str) -> Result<String> {
        let args: Value =
            serde_json::from_str(raw_arguments).context("tool arguments are not valid JSON")?;
        let args = args
            .as_object()
            .context("tool arguments must be a JSON object")?;
        let string_arg = |key: &str| args.get(key).and_then(Value::as_str);
        match name {
            "list_files" => self.list_files(string_arg("path").unwrap_or(".")),
            "read_file" => {
                let path = string_arg("path").context("read_file requires a \"path\" string")?;
                self.read_file(path)
            }
            "search_files" => {
                let query =
                    string_arg("query").context("search_files requires a \"query\" string")?;
                self.search_files(query, string_arg("path").unwrap_or("."))
            }
            other => bail!("unknown tool: {other}"),
        }
    }
}

fn is_skipped_dir(is_dir: bool, name: &std::ffi::OsStr) -> bool {
    is_dir && SKIPPED_DIRS.iter().any(|skip| name == *skip)
}

fn clip_line(line: &str) -> String {
    if line.chars().count() <= MAX_LINE_CHARS {
        line.to_string()
    } else {
        let clipped: String = line.chars().take(MAX_LINE_CHARS).collect();
        format!("{clipped}…")
    }
}

/// Tool schemas sent with every chat request.
pub fn schemas() -> Value {
    json!([
        {
            "type": "function",
            "function": {
                "name": "list_files",
                "description": "Recursively list files below a directory in the workspace. Returns paths relative to the workspace root, skips .git and target directories, and returns at most 500 paths.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "Directory to list, relative to the workspace root. Use \".\" for the whole workspace."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read one UTF-8 text file and return its contents with line numbers. Rejects directories, binary files, and files larger than 128 KiB.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "File path relative to the workspace root, for example \"src/main.rs\"."
                        }
                    },
                    "required": ["path"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "search_files",
                "description": "Case-sensitive literal substring search across UTF-8 files below a directory. Not a regex search. Returns \"path:line: text\" entries, at most 100.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Exact substring to look for."
                        },
                        "path": {
                            "type": "string",
                            "description": "Directory to search, relative to the workspace root. Use \".\" for the whole workspace."
                        }
                    },
                    "required": ["query", "path"]
                }
            }
        }
    ])
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn workspace() -> (TempDir, Workspace) {
        let dir = TempDir::new().expect("create temp dir");
        fs::create_dir(dir.path().join("src")).unwrap();
        fs::write(dir.path().join("src/main.rs"), "fn main() {}\n").unwrap();
        fs::write(dir.path().join("README.md"), "# Sample\n").unwrap();
        let ws = Workspace::new(dir.path()).unwrap();
        (dir, ws)
    }

    #[test]
    fn reads_a_valid_relative_path() {
        let (_dir, ws) = workspace();
        let out = ws.read_file("src/main.rs").unwrap();
        assert!(out.contains("fn main() {}"));
        assert!(out.contains("    1  "), "output should be line-numbered: {out}");
    }

    #[test]
    fn rejects_parent_traversal() {
        let (_dir, ws) = workspace();
        for path in ["../secret.txt", "src/../../secret.txt", ".."] {
            let err = ws.read_file(path).unwrap_err().to_string();
            assert!(err.contains("traversal"), "{path} -> {err}");
        }
    }

    #[test]
    fn rejects_absolute_paths() {
        let (_dir, ws) = workspace();
        for path in [r"C:\Windows\win.ini", "/etc/passwd", r"\temp\x.txt"] {
            let err = ws.read_file(path).unwrap_err().to_string();
            assert!(err.contains("absolute"), "{path} -> {err}");
        }
    }

    #[test]
    fn rejects_symlink_escaping_the_workspace() {
        let (_dir, ws) = workspace();
        let outside = TempDir::new().unwrap();
        fs::write(outside.path().join("secret.txt"), "secret").unwrap();
        let link = ws.root().join("escape.txt");
        // Symlink creation needs privileges or developer mode on Windows;
        // skip the test when it is unavailable.
        #[cfg(windows)]
        let created =
            std::os::windows::fs::symlink_file(outside.path().join("secret.txt"), &link);
        #[cfg(unix)]
        let created = std::os::unix::fs::symlink(outside.path().join("secret.txt"), &link);
        if created.is_err() {
            eprintln!("skipping symlink test: cannot create symlinks here");
            return;
        }
        let err = ws.read_file("escape.txt").unwrap_err().to_string();
        assert!(err.contains("escapes the workspace"), "{err}");
    }

    #[test]
    fn rejects_oversized_files() {
        let (_dir, ws) = workspace();
        let big = vec![b'a'; (MAX_FILE_BYTES + 1) as usize];
        fs::write(ws.root().join("big.txt"), big).unwrap();
        let err = ws.read_file("big.txt").unwrap_err().to_string();
        assert!(err.contains("bytes"), "{err}");
    }

    #[test]
    fn rejects_binary_content() {
        let (_dir, ws) = workspace();
        fs::write(ws.root().join("blob.bin"), [0xff, 0xfe, 0x00, 0x01]).unwrap();
        let err = ws.read_file("blob.bin").unwrap_err().to_string();
        assert!(err.contains("not UTF-8"), "{err}");
    }

    #[test]
    fn rejects_reading_a_directory() {
        let (_dir, ws) = workspace();
        let err = ws.read_file("src").unwrap_err().to_string();
        assert!(err.contains("directory"), "{err}");
    }

    #[test]
    fn list_skips_git_and_target_and_truncates() {
        let (_dir, ws) = workspace();
        fs::create_dir(ws.root().join(".git")).unwrap();
        fs::write(ws.root().join(".git/config"), "x").unwrap();
        fs::create_dir(ws.root().join("target")).unwrap();
        fs::write(ws.root().join("target/out.o"), "x").unwrap();
        let many = ws.root().join("many");
        fs::create_dir(&many).unwrap();
        for i in 0..(MAX_LIST_PATHS + 10) {
            fs::write(many.join(format!("f{i:04}.txt")), "x").unwrap();
        }
        let out = ws.list_files(".").unwrap();
        assert!(!out.contains(".git/config"));
        assert!(!out.contains("target/out.o"));
        assert!(out.contains("[truncated"), "expected truncation note");
        assert_eq!(
            out.lines().filter(|l| !l.starts_with('[')).count(),
            MAX_LIST_PATHS
        );
    }

    #[test]
    fn search_finds_matches_and_truncates() {
        let (_dir, ws) = workspace();
        let mut noisy = String::new();
        for i in 0..(MAX_SEARCH_MATCHES + 50) {
            noisy.push_str(&format!("needle line {i}\n"));
        }
        fs::write(ws.root().join("noisy.txt"), noisy).unwrap();
        let out = ws.search_files("needle", ".").unwrap();
        assert!(out.contains("noisy.txt:1: needle line 0"));
        assert!(out.contains("[truncated"));
        assert_eq!(
            out.lines().filter(|l| !l.starts_with('[')).count(),
            MAX_SEARCH_MATCHES
        );
        // Case-sensitive literal search.
        let none = ws.search_files("NEEDLE", ".").unwrap();
        assert!(none.contains("no matches"));
    }

    #[test]
    fn search_skips_oversized_files() {
        let (_dir, ws) = workspace();
        let mut big = String::from("needle\n");
        big.push_str(&"a".repeat(MAX_FILE_BYTES as usize));
        fs::write(ws.root().join("big.txt"), big).unwrap();
        let out = ws.search_files("needle", ".").unwrap();
        assert!(out.contains("no matches"), "{out}");
    }

    #[test]
    fn execute_returns_errors_as_text() {
        let (_dir, ws) = workspace();
        assert!(ws.execute("read_file", "not json").starts_with("Error:"));
        assert!(ws.execute("read_file", "{}").starts_with("Error:"));
        assert!(ws.execute("no_such_tool", "{}").starts_with("Error:"));
        let ok = ws.execute("read_file", r#"{"path":"README.md"}"#);
        assert!(ok.contains("# Sample"), "{ok}");
    }
}
