import { describe, it, expect } from "vitest";
import { validateConfig, sampleArgs } from "../src/commands/validate-config.js";

const ANALYSIS = {
  app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" },
  capabilities: [
    { id: "read_status", domain: "vehicle", object: "gear", action: "read_status",
      params: [{ name: "mode", type: "number" }],
      safetyLevel: "readonly", sdkCalls: ["@system.vehicle"], sourceRef: "s.ts:r" },
  ],
};

describe("validateConfig", () => {
  it("valid: covers all capabilities + dispatchable", () => {
    const config = { read_status: { type: "dbus", bus: "b", path: "p", method: "request", arg: { funcName: "read" }, reply: "json" } };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
  it("invalid: missing op for a capability (coverage)", () => {
    const r = validateConfig({}, ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("read_status");
  });
});
describe("sampleArgs", () => {
  it("synthesizes by type, skips optional", () => {
    expect(sampleArgs([{ name: "n", type: "number" }, { name: "s", type: "string" }, { name: "b", type: "boolean" }, { name: "o", type: "string", optional: true }])).toEqual({ n: 1, s: "x", b: true });
  });
});
