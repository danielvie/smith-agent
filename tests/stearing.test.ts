import { afterEach, describe, expect, test } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadStearingInstructions } from "../src/stearing";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("bundled stearing instructions", () => {
  test("loads every non-empty file recursively in path order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-stearing-"));
    temporaryDirectories.push(directory);
    await mkdir(join(directory, "nested"), { recursive: true });
    await writeFile(join(directory, "02-second.md"), "Second instruction.");
    await writeFile(join(directory, "01-first.txt"), "First instruction.\n");
    await writeFile(join(directory, "nested", "03-third"), "Third instruction.");
    await writeFile(join(directory, "empty.md"), "");

    expect(loadStearingInstructions(directory)).toBe("First instruction.\n\nSecond instruction.\n\nThird instruction.");
  });

  test("returns undefined for an empty folder", async () => {
    const directory = await mkdtemp(join(tmpdir(), "smith-stearing-"));
    temporaryDirectories.push(directory);
    await writeFile(join(directory, ".gitkeep"), "");

    expect(loadStearingInstructions(directory)).toBeUndefined();
  });
});
