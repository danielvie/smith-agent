import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile as readFileFromDisk, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openWorkspace, type Workspace } from "../src/workspace";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function makeWorkspace(): Promise<{ workspace: Workspace; directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "smith-workspace-"));
  temporaryDirectories.push(directory);
  return { workspace: await openWorkspace(directory), directory };
}

describe("workspace boundary", () => {
  test("rejects absolute paths and parent segments", async () => {
    const { workspace, directory } = await makeWorkspace();

    expect(() => workspace.resolvePath(join(directory, "outside.txt"))).toThrow("Absolute paths");
    expect(() => workspace.resolvePath("../outside.txt")).toThrow("Parent path segments");
    expect(() => workspace.resolvePath("nested/../outside.txt")).toThrow("Parent path segments");
  });

  test("reads, writes, and edits bounded files", async () => {
    const { workspace, directory } = await makeWorkspace();
    await mkdir(join(directory, "nested"));

    await workspace.writeFile("nested/notes.txt", "one\none\n");
    await expect(workspace.editFile("nested/notes.txt", "one", "two")).rejects.toThrow("matched 2 times");
    await workspace.editFile("nested/notes.txt", "one", "two", true);

    const result = await workspace.readFile("nested/notes.txt");
    expect(result.content).toBe("two\ntwo\n");
    expect(result.bytes).toBeGreaterThan(0);
  });

  test("does not follow a directory symlink outside the workspace", async () => {
    const { workspace, directory } = await makeWorkspace();
    const outside = await mkdtemp(join(tmpdir(), "smith-outside-"));
    temporaryDirectories.push(outside);
    await writeFile(join(outside, "secret.txt"), "private");

    const link = join(directory, "external");
    try {
      await symlink(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch {
      return;
    }

    await expect(workspace.readFile("external/secret.txt")).rejects.toThrow("outside");
    await expect(workspace.writeFile("external/new.txt", "should not write")).rejects.toThrow("outside");
    expect(await readFileFromDisk(join(outside, "secret.txt"), "utf8")).toBe("private");
  });

  test("runs a command with the workspace as its working directory", async () => {
    const { workspace } = await makeWorkspace();
    const command = process.platform === "win32" ? "echo smith" : "printf smith";
    const result = await workspace.runCommand(command, ".", undefined, 5_000);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("smith");
    expect(result.cwd).toBe(".");
  });
});
