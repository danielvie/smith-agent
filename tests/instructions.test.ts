import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadGlobalAgentInstructions } from "../src/instructions";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("agent instructions", () => {
  test("loads global agent instructions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-instructions-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, "AGENTS.md"), "Use concise responses.");

    expect(loadGlobalAgentInstructions(directory)).toBe("Use concise responses.");
  });

  test("returns undefined when personal instructions are unavailable", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-instructions-"));
    temporaryDirectories.push(directory);

    expect(loadGlobalAgentInstructions(directory)).toBeUndefined();
  });
});
