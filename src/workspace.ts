import { spawn } from "node:child_process";
import { lstat, readdir, readFile as readFileFromDisk, realpath, stat, writeFile as writeFileToDisk } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve, win32 } from "node:path";
import type { Readable } from "node:stream";

export const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
export const DEFAULT_MAX_COMMAND_OUTPUT_BYTES = 128 * 1024;
export const DEFAULT_COMMAND_TIMEOUT_MS = 30_000;
export const MAX_COMMAND_TIMEOUT_MS = 120_000;

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export interface WorkspaceOptions {
  maxFileBytes?: number;
  maxCommandOutputBytes?: number;
  commandTimeoutMs?: number;
}

export interface WorkspaceFile {
  path: string;
  bytes: number;
  content: string;
}

export interface WorkspaceEntry {
  name: string;
  type: "file" | "directory" | "symlink" | "other";
}

export interface CommandResult {
  command: string;
  cwd: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export const DEFAULT_MAX_SEARCH_MATCHES = 100;

export interface SearchOptions {
  pattern: string;
  path?: string;
  glob?: string;
  ignoreCase?: boolean;
  literal?: boolean;
  context?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface SearchContextLine {
  line: number;
  text: string;
}

export interface SearchMatch {
  path: string;
  line: number;
  text: string;
  before?: SearchContextLine[];
  after?: SearchContextLine[];
}

export interface SearchResult {
  matches: SearchMatch[];
  matchLimitReached: boolean;
  outputTruncated: boolean;
  filesSkipped: number;
}

const MAX_SEARCH_MATCHES = 1_000;
const MAX_SEARCH_CONTEXT_LINES = 10;
const MAX_SEARCH_LINE_CHARS = 2_000;
const MAX_SEARCH_RESULT_BYTES = 128 * 1024;
const IGNORED_SEARCH_DIRECTORIES = new Set([".git", "node_modules"]);
function isAnyAbsolutePath(value: string): boolean {
  return isAbsolute(value) || win32.isAbsolute(value) || posix.isAbsolute(value);
}

function hasParentSegment(value: string): boolean {
  return value.split(/[\\/]+/u).some((segment) => segment === "..");
}

function isWithin(root: string, candidate: string): boolean {
  const childPath = relative(root, candidate);
  return childPath === "" || (childPath !== ".." && !childPath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAnyAbsolutePath(childPath));
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

const PATH_SEPARATOR = String.fromCharCode(92);
const REGEXP_SPECIAL_CHARACTERS = `${PATH_SEPARATOR}^$.*+?()[]{}|`;

function escapeRegExp(value: string): string {
  return [...value].map((character) => REGEXP_SPECIAL_CHARACTERS.includes(character) ? `${PATH_SEPARATOR}${character}` : character).join("");
}

function globRegExp(pattern: string): RegExp {
  const normalized = pattern.split(PATH_SEPARATOR).join("/");
  let expression = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      index += 1;
      if (normalized[index + 1] === "/") {
        index += 1;
        expression += "(?:.*/)?";
      } else {
        expression += ".*";
      }
      continue;
    }
    if (character === "*") {
      expression += "[^/]*";
      continue;
    }
    if (character === "?") {
      expression += "[^/]";
      continue;
    }
    expression += escapeRegExp(character);
  }
  return new RegExp(`${expression}$`, "u");
}

function matchesGlob(relativePath: string, pattern: string | undefined): boolean {
  if (!pattern) return true;
  const matcher = globRegExp(pattern);
  const normalizedPath = relativePath.split(PATH_SEPARATOR).join("/");
  const fileName = normalizedPath.slice(normalizedPath.lastIndexOf("/") + 1);
  return matcher.test(normalizedPath) || matcher.test(fileName);
}

function truncateSearchLine(value: string): string {
  return value.length > MAX_SEARCH_LINE_CHARS ? `${value.slice(0, MAX_SEARCH_LINE_CHARS)}…` : value;
}

function asWorkspaceError(error: unknown, fallback: string): WorkspaceError {
  if (error instanceof WorkspaceError) return error;
  if (error instanceof Error && error.message) return new WorkspaceError(error.message);
  return new WorkspaceError(fallback);
}

async function readLimited(stream: Readable | null, maxBytes: number, signal?: AbortSignal): Promise<{ text: string; truncated: boolean }> {
  if (!stream) return { text: "", truncated: false };

  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;
  const cancel = () => stream.destroy();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });

  try {
    for await (const value of stream) {
      const next = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value);
      if (bytes >= maxBytes) {
        truncated = true;
        continue;
      }

      const remaining = maxBytes - bytes;
      const chunk = next.subarray(0, remaining);
      chunks.push(chunk);
      bytes += chunk.byteLength;
      if (chunk.byteLength < next.byteLength) truncated = true;
    }
  } finally {
    signal?.removeEventListener("abort", cancel);
  }

  let text = "";
  for (const chunk of chunks) text += decoder.decode(chunk, { stream: true });
  text += decoder.decode();
  return { text, truncated };
}

export class Workspace {
  readonly root: string;
  readonly maxFileBytes: number;
  readonly maxCommandOutputBytes: number;
  readonly commandTimeoutMs: number;

  constructor(root: string, options: WorkspaceOptions = {}) {
    this.root = root;
    this.maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
    this.maxCommandOutputBytes = options.maxCommandOutputBytes ?? DEFAULT_MAX_COMMAND_OUTPUT_BYTES;
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  resolvePath(relativePath: string): string {
    if (relativePath.includes("\0")) throw new WorkspaceError("Paths cannot contain a null byte.");
    if (isAnyAbsolutePath(relativePath)) throw new WorkspaceError("Absolute paths are not allowed.");
    if (hasParentSegment(relativePath)) throw new WorkspaceError("Parent path segments (..) are not allowed.");

    const candidate = resolve(this.root, relativePath || ".");
    if (!isWithin(this.root, candidate)) throw new WorkspaceError("Path is outside the workspace.");
    return candidate;
  }

  async readFile(relativePath: string): Promise<WorkspaceFile> {
    const filePath = await this.existingPath(relativePath, "file");
    const fileInfo = await stat(filePath);
    if (fileInfo.size > this.maxFileBytes) {
      throw new WorkspaceError(`File exceeds the ${this.maxFileBytes}-byte limit.`);
    }

    try {
      const content = await readFileFromDisk(filePath, "utf8");
      return { path: relative(this.root, filePath) || ".", bytes: byteLength(content), content };
    } catch (error) {
      throw asWorkspaceError(error, `Could not read ${relativePath}.`);
    }
  }

  async search(options: SearchOptions): Promise<SearchResult> {
    if (!options.pattern) throw new WorkspaceError("pattern must not be empty.");
    if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 1)) {
      throw new WorkspaceError("limit must be a positive integer.");
    }
    if (options.context !== undefined && (!Number.isInteger(options.context) || options.context < 0)) {
      throw new WorkspaceError("context must be a non-negative integer.");
    }

    const expression = options.literal ? escapeRegExp(options.pattern) : options.pattern;
    let matcher: RegExp;
    try {
      matcher = new RegExp(expression, options.ignoreCase ? "iu" : "u");
    } catch (error) {
      throw new WorkspaceError(`Invalid search pattern: ${error instanceof Error ? error.message : String(error)}`);
    }

    const limit = Math.min(options.limit ?? DEFAULT_MAX_SEARCH_MATCHES, MAX_SEARCH_MATCHES);
    const context = Math.min(options.context ?? 0, MAX_SEARCH_CONTEXT_LINES);
    const root = await this.searchablePath(options.path ?? ".");
    const files = root.isDirectory ? await this.searchFiles(root.path, options.signal) : [root.path];
    const matches: SearchMatch[] = [];
    let outputBytes = 0;
    let matchLimitReached = false;
    let outputTruncated = false;
    let filesSkipped = 0;

    searchFiles: for (const filePath of files) {
      options.signal?.throwIfAborted();
      const relativePath = relative(this.root, filePath).split(PATH_SEPARATOR).join("/") || ".";
      if (!matchesGlob(relativePath, options.glob)) continue;

      let content: string;
      try {
        const fileInfo = await stat(filePath);
        if (fileInfo.size > this.maxFileBytes) {
          filesSkipped += 1;
          continue;
        }
        content = await readFileFromDisk(filePath, "utf8");
      } catch {
        filesSkipped += 1;
        continue;
      }
      if (content.includes("\0")) {
        filesSkipped += 1;
        continue;
      }

      const lines = content.replace(/\r\n/gu, "\n").replace(/\r/gu, "\n").split("\n");
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        options.signal?.throwIfAborted();
        const line = lines[lineIndex];
        if (!matcher.test(line)) continue;

        const match: SearchMatch = {
          path: relativePath,
          line: lineIndex + 1,
          text: truncateSearchLine(line),
        };
        if (context > 0) {
          const beforeStart = Math.max(0, lineIndex - context);
          const before = lines.slice(beforeStart, lineIndex).map((text, offset) => ({
            line: beforeStart + offset + 1,
            text: truncateSearchLine(text),
          }));
          const after = lines.slice(lineIndex + 1, lineIndex + context + 1).map((text, offset) => ({
            line: lineIndex + offset + 2,
            text: truncateSearchLine(text),
          }));
          if (before.length > 0) match.before = before;
          if (after.length > 0) match.after = after;
        }

        const matchBytes = byteLength(JSON.stringify(match));
        if (matches.length > 0 && outputBytes + matchBytes > MAX_SEARCH_RESULT_BYTES) {
          outputTruncated = true;
          break searchFiles;
        }
        matches.push(match);
        outputBytes += matchBytes;
        if (matches.length >= limit) {
          matchLimitReached = true;
          break searchFiles;
        }
      }
    }

    return { matches, matchLimitReached, outputTruncated, filesSkipped };
  }

  async writeFile(relativePath: string, content: string): Promise<WorkspaceFile> {
    const filePath = await this.writablePath(relativePath);
    const bytes = byteLength(content);
    if (bytes > this.maxFileBytes) {
      throw new WorkspaceError(`File exceeds the ${this.maxFileBytes}-byte limit.`);
    }

    try {
      await writeFileToDisk(filePath, content, "utf8");
      return { path: relative(this.root, filePath) || ".", bytes, content };
    } catch (error) {
      throw asWorkspaceError(error, `Could not write ${relativePath}.`);
    }
  }

  async editFile(relativePath: string, oldText: string, newText: string, replaceAll = false): Promise<WorkspaceFile> {
    if (!oldText) throw new WorkspaceError("old_text must not be empty.");

    const current = await this.readFile(relativePath);
    const occurrences = current.content.split(oldText).length - 1;
    if (occurrences === 0) throw new WorkspaceError("old_text was not found in the file.");
    if (!replaceAll && occurrences !== 1) {
      throw new WorkspaceError(`old_text matched ${occurrences} times. Set replace_all to true or include more context.`);
    }

    const content = replaceAll ? current.content.split(oldText).join(newText) : current.content.replace(oldText, newText);
    return this.writeFile(relativePath, content);
  }

  async listDirectory(relativePath = "."): Promise<WorkspaceEntry[]> {
    const directoryPath = await this.existingPath(relativePath, "directory");
    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });
      return entries
        .map((entry) => ({
          name: entry.name,
          type: entry.isFile() ? "file" : entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "other",
        }) satisfies WorkspaceEntry)
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      throw asWorkspaceError(error, `Could not list ${relativePath}.`);
    }
  }

  async runCommand(command: string, relativeCwd = ".", signal?: AbortSignal, timeoutMs = this.commandTimeoutMs): Promise<CommandResult> {
    if (!command.trim()) throw new WorkspaceError("command must not be empty.");
    if (command.length > 8_000) throw new WorkspaceError("command exceeds the 8000-character limit.");
    signal?.throwIfAborted();

    const cwdPath = await this.existingPath(relativeCwd, "directory");
    const boundedTimeout = Math.max(1, Math.min(timeoutMs, MAX_COMMAND_TIMEOUT_MS));
    const commandLine = process.platform === "win32" ? ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command] : ["/bin/sh", "-lc", command];
    const processHandle = spawn(commandLine[0], commandLine.slice(1), { cwd: cwdPath, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const exited = new Promise<number>((resolveExit, rejectExit) => {
      processHandle.once("error", rejectExit);
      processHandle.once("close", (code) => resolveExit(code ?? -1));
    });
    let timedOut = false;
    const termination = new AbortController();
    const stopProcess = () => {
      termination.abort();
      try {
        processHandle.kill();
      } catch {
        // The process may have exited between the abort and kill calls.
      }
    };
    const onAbort = () => stopProcess();
    signal?.addEventListener("abort", onAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      stopProcess();
    }, boundedTimeout);

    try {
      const [stdout, stderr, exitCode] = await Promise.all([
        readLimited(processHandle.stdout, this.maxCommandOutputBytes, termination.signal),
        readLimited(processHandle.stderr, this.maxCommandOutputBytes, termination.signal),
        exited,
      ]);

      if (signal?.aborted) throw new WorkspaceError("Command was aborted.");
      if (timedOut) throw new WorkspaceError(`Command timed out after ${boundedTimeout} ms.`);

      return {
        command,
        cwd: relative(this.root, cwdPath) || ".",
        exitCode,
        stdout: stdout.text,
        stderr: stderr.text,
        stdoutTruncated: stdout.truncated,
        stderrTruncated: stderr.truncated,
      };
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  private async searchablePath(relativePath: string): Promise<{ path: string; isDirectory: boolean }> {
    const candidate = this.resolvePath(relativePath);
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(candidate);
    } catch (error) {
      throw asWorkspaceError(error, `Path does not exist: ${relativePath}.`);
    }

    if (!isWithin(this.root, canonicalPath)) throw new WorkspaceError("Path resolves outside the workspace.");
    const pathInfo = await stat(canonicalPath);
    if (!pathInfo.isFile() && !pathInfo.isDirectory()) throw new WorkspaceError(`${relativePath} is not a searchable file or directory.`);
    return { path: canonicalPath, isDirectory: pathInfo.isDirectory() };
  }

  private async searchFiles(directoryPath: string, signal?: AbortSignal): Promise<string[]> {
    const files: string[] = [];
    const visit = async (currentPath: string): Promise<void> => {
      signal?.throwIfAborted();
      let entries;
      try {
        entries = await readdir(currentPath, { withFileTypes: true });
      } catch (error) {
        throw asWorkspaceError(error, `Could not list ${relative(this.root, currentPath) || "."}.`);
      }

      for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        signal?.throwIfAborted();
        if (entry.isSymbolicLink()) continue;
        const childPath = join(currentPath, entry.name);
        if (entry.isDirectory()) {
          if (IGNORED_SEARCH_DIRECTORIES.has(entry.name)) continue;
          await visit(childPath);
        } else if (entry.isFile()) {
          files.push(childPath);
        }
      }
    };

    await visit(directoryPath);
    return files;
  }

  private async existingPath(relativePath: string, expected: "file" | "directory"): Promise<string> {
    const candidate = this.resolvePath(relativePath);
    let canonicalPath: string;
    try {
      canonicalPath = await realpath(candidate);
    } catch (error) {
      throw asWorkspaceError(error, `Path does not exist: ${relativePath}.`);
    }

    if (!isWithin(this.root, canonicalPath)) throw new WorkspaceError("Path resolves outside the workspace.");
    const pathInfo = await stat(canonicalPath);
    if (expected === "file" && !pathInfo.isFile()) throw new WorkspaceError(`${relativePath} is not a file.`);
    if (expected === "directory" && !pathInfo.isDirectory()) throw new WorkspaceError(`${relativePath} is not a directory.`);
    return canonicalPath;
  }

  private async writablePath(relativePath: string): Promise<string> {
    const candidate = this.resolvePath(relativePath);
    if (candidate === this.root) throw new WorkspaceError("The workspace root is not a file.");

    let parentPath: string;
    try {
      parentPath = await realpath(dirname(candidate));
    } catch (error) {
      throw asWorkspaceError(error, `Parent directory does not exist: ${relativePath}.`);
    }
    if (!isWithin(this.root, parentPath)) throw new WorkspaceError("Parent directory resolves outside the workspace.");

    try {
      const entry = await lstat(candidate);
      if (entry.isSymbolicLink()) throw new WorkspaceError("Writing through a symbolic link is not allowed.");
      const canonicalPath = await realpath(candidate);
      if (!isWithin(this.root, canonicalPath)) throw new WorkspaceError("Path resolves outside the workspace.");
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      if (code !== "ENOENT") throw asWorkspaceError(error, `Could not inspect ${relativePath}.`);
    }

    return join(parentPath, candidate.slice(dirname(candidate).length + 1));
  }
}

export async function openWorkspace(rootPath = process.cwd(), options: WorkspaceOptions = {}): Promise<Workspace> {
  let canonicalRoot: string;
  try {
    canonicalRoot = await realpath(resolve(rootPath));
  } catch (error) {
    throw asWorkspaceError(error, `Workspace does not exist: ${rootPath}.`);
  }

  try {
    const rootInfo = await stat(canonicalRoot);
    if (!rootInfo.isDirectory()) throw new WorkspaceError("Workspace path is not a directory.");
  } catch (error) {
    throw asWorkspaceError(error, `Workspace is not a directory: ${rootPath}.`);
  }

  return new Workspace(canonicalRoot, options);
}
