import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ConfigError, loadSmithConfig } from "../src/config";
import { openWorkspace } from "../src/workspace";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeWorkspace(): Promise<{ directory: string; workspace: Awaited<ReturnType<typeof openWorkspace>> }> {
  const directory = await mkdtemp(join(tmpdir(), "smith-config-"));
  temporaryDirectories.push(directory);
  return { directory, workspace: await openWorkspace(directory) };
}

describe("Smith config", () => {
  test("loads the model from the workspace config file", async () => {
    const { directory, workspace } = await makeWorkspace();
    await writeFile(join(directory, "smith.config.json"), '{"model":" accounts/fireworks/models/kimi-k2p7-code "}');

    await expect(loadSmithConfig(workspace)).resolves.toEqual({ model: "accounts/fireworks/models/kimi-k2p7-code" });
  });

  test("loads the optional Chrome DevTools setting", async () => {
    const { directory, workspace } = await makeWorkspace();
    await writeFile(join(directory, "smith.config.json"), '{"chromeDevtools":true}');

    await expect(loadSmithConfig(workspace)).resolves.toEqual({ chromeDevtools: true });
  });

  test("returns an empty config when the file is absent", async () => {
    const { workspace } = await makeWorkspace();

    await expect(loadSmithConfig(workspace)).resolves.toEqual({});
  });

  test("rejects malformed config values", async () => {
    const { directory, workspace } = await makeWorkspace();
    await writeFile(join(directory, "smith.config.json"), '{"model":42}');

    await expect(loadSmithConfig(workspace)).rejects.toBeInstanceOf(ConfigError);
    await expect(loadSmithConfig(workspace)).rejects.toThrow("model must be a non-empty string");
  });

  test("rejects malformed Chrome DevTools settings", async () => {
    const { directory, workspace } = await makeWorkspace();
    await writeFile(join(directory, "smith.config.json"), '{"chromeDevtools":"yes"}');

    await expect(loadSmithConfig(workspace)).rejects.toThrow("chromeDevtools must be a boolean");
  });
});
