import { describe, it, expect } from "vitest";

describe("registerGracefulShutdown", () => {
  it("exports a function", async () => {
    const mod = await import("../src/shutdown.js");
    expect(typeof mod.registerGracefulShutdown).toBe("function");
  });
});
