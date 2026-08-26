import { describe, expect, test } from "vitest";

describe("runtime", () => {
  test("runs under the required Node version", () => {
    expect(process.versions.node).toBe("22.22.3");
  });
});
