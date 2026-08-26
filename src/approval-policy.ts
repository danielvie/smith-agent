import { access } from "node:fs/promises";
import type { Workspace } from "./workspace";

export const DEFAULT_APPROVALS_PATH = "approvals.json";

export class ApprovalPolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApprovalPolicyError";
  }
}

export class ApprovalPolicyStore {
  private readonly alwaysApprovedTools: Set<string>;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly workspace: Workspace, private readonly relativePath: string, tools: Iterable<string> = []) {
    this.alwaysApprovedTools = new Set(tools);
  }

  isAlwaysApproved(toolName: string): boolean {
    return this.alwaysApprovedTools.has(toolName);
  }

  list(): string[] {
    return [...this.alwaysApprovedTools].sort();
  }

  async alwaysApprove(toolName: string): Promise<void> {
    if (this.alwaysApprovedTools.has(toolName)) return;
    this.alwaysApprovedTools.add(toolName);
    const write = this.writeQueue
      .catch(() => undefined)
      .then(() => this.workspace.writeFile(this.relativePath, `${JSON.stringify({ alwaysApprove: this.list() }, null, 2)}\n`))
      .then(() => undefined);
    this.writeQueue = write;
    try {
      await write;
    } catch (error) {
      this.alwaysApprovedTools.delete(toolName);
      throw error;
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function loadApprovalPolicy(workspace: Workspace, relativePath = DEFAULT_APPROVALS_PATH): Promise<ApprovalPolicyStore> {
  const policyPath = workspace.resolvePath(relativePath);
  try {
    await access(policyPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new ApprovalPolicyStore(workspace, relativePath);
    throw error;
  }

  const file = await workspace.readFile(relativePath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.content);
  } catch (error) {
    throw new ApprovalPolicyError(`Invalid JSON in ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!isRecord(parsed)) throw new ApprovalPolicyError(`${relativePath} must contain a JSON object.`);
  if (parsed.alwaysApprove !== undefined && (!Array.isArray(parsed.alwaysApprove) || parsed.alwaysApprove.some((tool) => typeof tool !== "string" || !tool.trim()))) {
    throw new ApprovalPolicyError(`${relativePath}.alwaysApprove must be an array of non-empty strings.`);
  }

  const tools = Array.isArray(parsed.alwaysApprove)
    ? parsed.alwaysApprove.map((tool) => tool.trim()).filter((tool, index, all) => all.indexOf(tool) === index)
    : [];
  return new ApprovalPolicyStore(workspace, relativePath, tools);
}
