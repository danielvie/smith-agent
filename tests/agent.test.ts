import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { AgentConfigurationError, createWorkspaceTools, mapPiEvent, SmithAgentSession } from "../src/agent";
import { openWorkspace } from "../src/workspace";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Smith agent adapter", () => {
  test("exposes and executes workspace tools", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-agent-"));
    temporaryDirectories.push(directory);
    const workspace = await openWorkspace(directory);
    await workspace.writeFile("hello.txt", "hello");

    const tools = createWorkspaceTools(workspace);
    expect(tools.map((tool) => tool.name)).toEqual(["list_files", "read_file", "search", "write_file", "edit_file", "run_command"]);

    const readTool = tools.find((tool) => tool.name === "read_file");
    if (!readTool) throw new Error("read_file tool was not created");
    const result = await readTool.execute("test-call", { path: "hello.txt" });
    expect((result.details as { content: string }).content).toBe("hello");

    const searchTool = tools.find((tool) => tool.name === "search");
    if (!searchTool) throw new Error("search tool was not created");
    const searchResult = await searchTool.execute("test-call", { pattern: "hello" });
    expect((searchResult.details as { matches: Array<{ path: string; line: number; text: string }> }).matches).toEqual([{ path: "hello.txt", line: 1, text: "hello" }]);
  });

  test("maps Pi stream events to app-owned events", () => {
    const textEvent = {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "hello" },
    } as unknown as AgentEvent;
    const toolEvent = {
      type: "tool_execution_start",
      toolCallId: "call-1",
      toolName: "read_file",
      args: { path: "hello.txt" },
    } as unknown as AgentEvent;

    expect(mapPiEvent(textEvent)).toEqual([{ type: "text_delta", delta: "hello" }]);
    expect(mapPiEvent(toolEvent)).toEqual([
      { type: "tool_start", toolCallId: "call-1", toolName: "read_file", args: { path: "hello.txt" } },
    ]);
  });

  test("maps provider errors to app-owned errors", () => {
    const event = {
      type: "message_end",
      message: { role: "assistant", stopReason: "error", errorMessage: "provider failed" },
    } as unknown as AgentEvent;

    expect(mapPiEvent(event)).toEqual([{ type: "error", message: "provider failed" }]);
  });

  test("uses the Fireworks environment key and Kimi K2.6 by default", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-agent-"));
    temporaryDirectories.push(directory);
    const workspace = await openWorkspace(directory);
    const previousKey = process.env.API_KEY_FIREWORKS;
    const previousModel = process.env.SMITH_MODEL;
    process.env.API_KEY_FIREWORKS = "test-fireworks-key";
    delete process.env.SMITH_MODEL;

    try {
      const session = SmithAgentSession.create({ workspace });
      expect(session.modelId).toBe("accounts/fireworks/models/kimi-k2p6");
    } finally {
      if (previousKey === undefined) delete process.env.API_KEY_FIREWORKS;
      else process.env.API_KEY_FIREWORKS = previousKey;
      if (previousModel === undefined) delete process.env.SMITH_MODEL;
      else process.env.SMITH_MODEL = previousModel;
    }
  });

  test("fails early when Fireworks credentials are missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-agent-"));
    temporaryDirectories.push(directory);
    const workspace = await openWorkspace(directory);
    const previousApiKey = process.env.API_KEY_FIREWORKS;
    const previousPiKey = process.env.FIREWORKS_API_KEY;
    delete process.env.API_KEY_FIREWORKS;
    delete process.env.FIREWORKS_API_KEY;

    try {
      expect(() => SmithAgentSession.create({ workspace })).toThrow(AgentConfigurationError);
      expect(() => SmithAgentSession.create({ workspace })).toThrow("API_KEY_FIREWORKS is required");
    } finally {
      if (previousApiKey === undefined) delete process.env.API_KEY_FIREWORKS;
      else process.env.API_KEY_FIREWORKS = previousApiKey;
      if (previousPiKey === undefined) delete process.env.FIREWORKS_API_KEY;
      else process.env.FIREWORKS_API_KEY = previousPiKey;
    }
  });
});
