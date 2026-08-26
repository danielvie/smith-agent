import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ApprovalPolicyError, loadApprovalPolicy } from "../src/approval-policy";
import { openWorkspace } from "../src/workspace";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeWorkspace(): Promise<{ directory: string; workspace: Awaited<ReturnType<typeof openWorkspace>> }> {
  const directory = await mkdtemp(join(tmpdir(), "smith-approval-policy-"));
  temporaryDirectories.push(directory);
  return { directory, workspace: await openWorkspace(directory) };
}

describe("approval policy", () => {
  test("rejects malformed always-approve entries", async () => {
    const { directory, workspace } = await makeWorkspace();
    await writeFile(join(directory, "approvals.json"), '{"alwaysApprove":["chrome_navigate",42]}');

    await expect(loadApprovalPolicy(workspace)).rejects.toBeInstanceOf(ApprovalPolicyError);
    await expect(loadApprovalPolicy(workspace)).rejects.toThrow("alwaysApprove must be an array of non-empty strings");
  });
});
