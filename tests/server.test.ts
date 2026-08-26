import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startUiServer, type UiServerHandle } from "../src/server";
import { SessionStore } from "../src/session";
import { openWorkspace } from "../src/workspace";
import type { SmithEvent } from "../src/protocol";

const temporaryDirectories: string[] = [];
const servers: UiServerHandle[] = [];
const originalBcaiApiKey = process.env.UDAL_PAT;
const originalFireworksApiKey = process.env.API_KEY_FIREWORKS;

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  if (originalBcaiApiKey === undefined) delete process.env.UDAL_PAT;
  else process.env.UDAL_PAT = originalBcaiApiKey;
  if (originalFireworksApiKey === undefined) delete process.env.API_KEY_FIREWORKS;
  else process.env.API_KEY_FIREWORKS = originalFireworksApiKey;
});

describe("browser server", () => {
  test("serves the UI and state over loopback HTTP", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-"));
    temporaryDirectories.push(directory);
    process.env.UDAL_PAT = "test-bcai-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);

    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Smith Agent");

    const stateResponse = await fetch(new URL("api/state", server.url));
    expect(stateResponse.status).toBe(200);
    expect(await stateResponse.json()).toMatchObject({
      model: "gpt-5.6-luna",
      running: false,
      queuedPrompts: [],
      contextUsage: { tokens: 0, contextWindow: expect.any(Number), estimated: false },
      mcpServers: [],
    });

    const eventsResponse = await fetch(new URL("events", server.url));
    expect(eventsResponse.headers.get("content-type")).toContain("text/event-stream");
    const reader = eventsResponse.body?.getReader();
    if (!reader) throw new Error("SSE response has no body");
    const firstEvent = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(firstEvent.value)).toContain('"type":"state"');
  });

  test("creates and switches persisted UI sessions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-sessions-"));
    temporaryDirectories.push(directory);
    process.env.UDAL_PAT = "test-bcai-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);
    const initialState = await (await fetch(new URL("api/state", server.url))).json() as { sessionId: string; sessions: Array<{ id: string }> };
    expect(typeof initialState.sessionId).toBe("string");
    expect(initialState.sessions).toHaveLength(1);

    const created = await fetch(new URL("api/session/new", server.url), { method: "POST", body: "{}" });
    expect(created.status).toBe(202);
    const nextState = await (await fetch(new URL("api/state", server.url))).json() as { sessionId: string; sessions: Array<{ id: string }> };
    expect(nextState.sessionId).not.toBe(initialState.sessionId);
    expect(nextState.sessions).toHaveLength(2);

    const resumed = await fetch(new URL("api/session/select", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: initialState.sessionId }),
    });
    expect(resumed.status).toBe(202);
    expect((await (await fetch(new URL("api/state", server.url))).json()).sessionId).toBe(initialState.sessionId);
  });

  test("deletes the active session and keeps one session available", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-delete-"));
    temporaryDirectories.push(directory);
    process.env.UDAL_PAT = "test-bcai-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);
    const initialState = await (await fetch(new URL("api/state", server.url))).json() as { sessionId: string; sessions: Array<{ id: string }> };
    await fetch(new URL("api/session/new", server.url), { method: "POST", body: "{}" });
    const createdState = await (await fetch(new URL("api/state", server.url))).json() as { sessionId: string };

    const deleted = await fetch(new URL("api/session/delete", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: createdState.sessionId }),
    });
    expect(deleted.status).toBe(202);
    const restoredState = await (await fetch(new URL("api/state", server.url))).json() as { sessionId: string; sessions: Array<{ id: string }> };
    expect(restoredState.sessionId).toBe(initialState.sessionId);
    expect(restoredState.sessions).toHaveLength(1);

    await fetch(new URL("api/session/delete", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: restoredState.sessionId }),
    });
    const replacementState = await (await fetch(new URL("api/state", server.url))).json() as { sessionId: string; sessions: Array<{ id: string }> };
    expect(replacementState.sessionId).not.toBe(restoredState.sessionId);
    expect(replacementState.sessions).toHaveLength(1);
  });

  test("renames a persisted UI session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-rename-"));
    temporaryDirectories.push(directory);
    process.env.UDAL_PAT = "test-bcai-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);
    const initialState = await (await fetch(new URL("api/state", server.url))).json() as { sessionId: string };
    const response = await fetch(new URL("api/session/rename", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "  Research   prices  " }),
    });

    expect(response.status).toBe(202);
    const state = await (await fetch(new URL("api/state", server.url))).json() as { sessions: Array<{ id: string; title: string }> };
    expect(state.sessions.find((session) => session.id === initialState.sessionId)?.title).toBe("Research prices");
    const store = new SessionStore(await openWorkspace(directory));
    await expect(store.load(initialState.sessionId)).resolves.toMatchObject({ title: "Research prices" });

    const invalid = await fetch(new URL("api/session/rename", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "   " }),
    });
    expect(invalid.status).toBe(400);
  });

  test("branches a persisted UI session before an edited prompt", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-branch-"));
    temporaryDirectories.push(directory);
    process.env.API_KEY_FIREWORKS = "test-fireworks-key";

    const workspace = await openWorkspace(directory);
    const store = new SessionStore(workspace);
    const record = await store.create("accounts/fireworks/models/kimi-k2p6");
    record.history = [
      { type: "prompt_start", promptId: "prompt-1", message: "first" },
      { type: "status", status: "completed" },
      { type: "prompt_start", promptId: "prompt-2", message: "second" },
      { type: "status", status: "completed" },
    ];
    record.promptMessageStarts = { "prompt-1": 0, "prompt-2": 0 };
    await store.save(record);

    const server = await startUiServer({ workspacePath: directory, sessionId: record.id, port: 0 });
    servers.push(server);
    const response = await fetch(new URL("api/session/branch", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptId: "prompt-2" }),
    });

    expect(response.status).toBe(202);
    const state = await (await fetch(new URL("api/state", server.url))).json() as { history: SmithEvent[] };
    expect(state.history).toEqual([
      { type: "prompt_start", promptId: "prompt-1", message: "first" },
      { type: "status", status: "completed" },
    ]);
  });

  test("rejects malformed screenshot payloads", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-screenshot-"));
    temporaryDirectories.push(directory);
    process.env.UDAL_PAT = "test-bcai-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);
    const response = await fetch(new URL("api/prompt", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Inspect this", images: [{ type: "image", mimeType: "image/png", data: "not-base64" }] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "screenshot data must be valid base64." });
  });

  test("rejects cancellation for unknown queued prompts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-"));
    temporaryDirectories.push(directory);
    process.env.UDAL_PAT = "test-bcai-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);
    const response = await fetch(new URL("api/queue/cancel", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueId: "missing" }),
    });

    expect(response.status).toBe(409);
  });

  test("rejects approval decisions for unknown requests", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-"));
    temporaryDirectories.push(directory);
    process.env.UDAL_PAT = "test-bcai-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);
    const response = await fetch(new URL("api/approval", server.url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: "missing", approved: true }),
    });

    expect(response.status).toBe(409);
  });
});
