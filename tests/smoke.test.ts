import { describe, expect, test } from "bun:test";

describe("POC scaffold", () => {
  test("runs under Bun", () => {
    expect(process.versions.bun).toBeString();
  });
});
