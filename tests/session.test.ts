import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { branchSessionRecord, SessionStore } from "../src/session";
import { openWorkspace } from "../src/workspace";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("session store", () => {
  test("creates, saves, lists, and reloads sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-sessions-"));
    temporaryDirectories.push(directory);
    const workspace = await openWorkspace(directory);
    const store = new SessionStore(workspace);
    const record = await store.create("test-model");

    await store.setTitle(record, "Investigate the browser issue");
    record.history.push({ type: "prompt_start", promptId: "prompt-1", message: "Investigate the browser issue" });
    await store.save(record);

    await expect(store.load(record.id)).resolves.toMatchObject({
      id: record.id,
      title: "Investigate the browser issue",
      modelId: "test-model",
      history: [{ type: "prompt_start", promptId: "prompt-1", message: "Investigate the browser issue" }],
    });
    await expect(store.list()).resolves.toHaveLength(1);
    await expect(store.latest()).resolves.toMatchObject({ id: record.id });
  });

  test("branches a session at a prompt boundary", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-session-branch-"));
    temporaryDirectories.push(directory);
    const workspace = await openWorkspace(directory);
    const store = new SessionStore(workspace);
    const record = await store.create("test-model");
    record.messages = [{}, {}, {}] as never;
    record.history = [
      { type: "prompt_start", promptId: "prompt-1", message: "first" },
      { type: "status", status: "completed" },
      { type: "prompt_start", promptId: "prompt-2", message: "second" },
      { type: "status", status: "completed" },
    ];
    record.promptMessageStarts = { "prompt-1": 0, "prompt-2": 2 };

    branchSessionRecord(record, "prompt-2");

    expect(record.history).toEqual([
      { type: "prompt_start", promptId: "prompt-1", message: "first" },
      { type: "status", status: "completed" },
    ]);
    expect(record.messages).toHaveLength(2);
    expect(record.promptMessageStarts).toEqual({ "prompt-1": 0 });
  });
});
