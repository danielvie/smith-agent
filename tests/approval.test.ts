import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ApprovalManager } from "../src/approval";
import { loadApprovalPolicy } from "../src/approval-policy";
import { openWorkspace } from "../src/workspace";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("approval manager", () => {
  test("publishes pending and approved state transitions", async () => {
    const manager = new ApprovalManager();
    const events: string[] = [];
    manager.subscribe((event) => events.push(`${event.type}:${event.approval.status}`));

    const pending = manager.request({ id: "approval-1", kind: "write", toolName: "write_file", args: { path: "notes.txt" } });
    expect(manager.list()[0]?.status).toBe("pending");
    expect(events).toEqual(["approval_request:pending"]);

    await expect(manager.decide("approval-1", "approve")).resolves.toBe(true);
    await expect(pending).resolves.toBe("approve");
    expect(manager.list()[0]?.status).toBe("approved");
    expect(events).toEqual(["approval_request:pending", "approval_update:approved"]);
  });

  test("marks pending approval cancelled when the run is aborted", async () => {
    const manager = new ApprovalManager();
    const controller = new AbortController();
    const pending = manager.request({ id: "approval-2", kind: "shell", toolName: "run_command", args: { command: "echo hi" } }, controller.signal);

    controller.abort();

    await expect(pending).resolves.toBe("deny");
    expect(manager.list()[0]?.status).toBe("cancelled");
  });

  test("persists always-approved tools and auto-approves later requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-approvals-"));
    temporaryDirectories.push(directory);
    const workspace = await openWorkspace(directory);
    const policy = await loadApprovalPolicy(workspace);
    const manager = new ApprovalManager(policy);
    const pending = manager.request({ id: "approval-3", kind: "browser", toolName: "chrome_navigate", args: { url: "https://example.com" } });

    await expect(manager.decide("approval-3", "always")).resolves.toBe(true);
    await expect(pending).resolves.toBe("approve");
    await expect(readFile(join(directory, "approvals.json"), "utf8")).resolves.toContain('"chrome_navigate"');

    const reloaded = new ApprovalManager(await loadApprovalPolicy(workspace));
    await expect(reloaded.request({ id: "approval-4", kind: "browser", toolName: "chrome_navigate", args: { url: "https://example.org" } })).resolves.toBe("approve");
  });
});
