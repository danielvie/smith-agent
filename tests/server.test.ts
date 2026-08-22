import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startUiServer, type UiServerHandle } from "../src/server";

const temporaryDirectories: string[] = [];
const servers: UiServerHandle[] = [];
const originalApiKey = process.env.API_KEY_FIREWORKS;

afterEach(async () => {
  for (const server of servers.splice(0)) server.stop();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  if (originalApiKey === undefined) delete process.env.API_KEY_FIREWORKS;
  else process.env.API_KEY_FIREWORKS = originalApiKey;
});

describe("browser server", () => {
  test("serves the UI and state over loopback HTTP", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-"));
    temporaryDirectories.push(directory);
    process.env.API_KEY_FIREWORKS = "test-fireworks-key";

    const server = await startUiServer({ workspacePath: directory, port: 0 });
    servers.push(server);

    const page = await fetch(server.url);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("Smith Agent");

    const stateResponse = await fetch(new URL("api/state", server.url));
    expect(stateResponse.status).toBe(200);
    expect(await stateResponse.json()).toMatchObject({ model: "accounts/fireworks/models/kimi-k2p6", running: false, queuedPrompts: [], mcpServers: [] });

    const eventsResponse = await fetch(new URL("events", server.url));
    expect(eventsResponse.headers.get("content-type")).toContain("text/event-stream");
    const reader = eventsResponse.body?.getReader();
    if (!reader) throw new Error("SSE response has no body");
    const firstEvent = await reader.read();
    await reader.cancel();
    expect(new TextDecoder().decode(firstEvent.value)).toContain('"type":"state"');
  });

  test("rejects cancellation for unknown queued prompts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-ui-"));
    temporaryDirectories.push(directory);
    process.env.API_KEY_FIREWORKS = "test-fireworks-key";

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
    process.env.API_KEY_FIREWORKS = "test-fireworks-key";

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
