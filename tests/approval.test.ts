import { describe, expect, test } from "bun:test";
import { ApprovalManager } from "../src/approval";

describe("approval manager", () => {
  test("publishes pending and approved state transitions", async () => {
    const manager = new ApprovalManager();
    const events: string[] = [];
    manager.subscribe((event) => events.push(`${event.type}:${event.approval.status}`));

    const pending = manager.request({ id: "approval-1", kind: "write", toolName: "write_file", args: { path: "notes.txt" } });
    expect(manager.list()[0]?.status).toBe("pending");
    expect(events).toEqual(["approval_request:pending"]);

    expect(manager.decide("approval-1", true)).toBe(true);
    await expect(pending).resolves.toBe(true);
    expect(manager.list()[0]?.status).toBe("approved");
    expect(events).toEqual(["approval_request:pending", "approval_update:approved"]);
  });

  test("marks pending approval cancelled when the run is aborted", async () => {
    const manager = new ApprovalManager();
    const controller = new AbortController();
    const pending = manager.request({ id: "approval-2", kind: "shell", toolName: "run_command", args: { command: "echo hi" } }, controller.signal);

    controller.abort();

    await expect(pending).resolves.toBe(false);
    expect(manager.list()[0]?.status).toBe("cancelled");
  });
});
