import { lstat, readdir, readFile as readFileFromDisk, realpath, stat, writeFile as writeFileToDisk } from "node:fs/promises";
import { dirname, isAbsolute, join, posix, relative, resolve, win32 } from "node:path";

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

function asWorkspaceError(error: unknown, fallback: string): WorkspaceError {
  if (error instanceof WorkspaceError) return error;
  if (error instanceof Error && error.message) return new WorkspaceError(error.message);
  return new WorkspaceError(fallback);
}

async function readLimited(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!stream) return { text: "", truncated: false };

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let truncated = false;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (bytes >= maxBytes) {
        truncated = true;
        continue;
      }

      const remaining = maxBytes - bytes;
      const chunk = next.value.subarray(0, remaining);
      chunks.push(chunk);
      bytes += chunk.byteLength;
      if (chunk.byteLength < next.value.byteLength) truncated = true;
    }
  } finally {
    reader.releaseLock();
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
    const commandLine = process.platform === "win32" ? ["cmd.exe", "/d", "/s", "/c", command] : ["/bin/sh", "-lc", command];
    const processHandle = Bun.spawn(commandLine, { cwd: cwdPath, stdout: "pipe", stderr: "pipe" });
    let timedOut = false;
    const stopProcess = () => {
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
      const [stdout, stderr] = await Promise.all([
        readLimited(processHandle.stdout, this.maxCommandOutputBytes),
        readLimited(processHandle.stderr, this.maxCommandOutputBytes),
      ]);
      const exitCode = await processHandle.exited;

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
