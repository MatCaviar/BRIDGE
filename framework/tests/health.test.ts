import { describe, it, expect } from "vitest";

describe("registerHealthTool", () => {
  it("exports a function", async () => {
    const mod = await import("../src/health.js");
    expect(typeof mod.registerHealthTool).toBe("function");
  });
});
