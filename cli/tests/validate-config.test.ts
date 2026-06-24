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

// Analysis with mixed capabilities: some RPC-able, some deferred (non-RPC).
const ANALYSIS_MIXED = {
  app: { name: "mixedapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" },
  capabilities: [
    { id: "soundstage_read", domain: "audio", object: "soundstage", action: "read",
      params: [], safetyLevel: "readonly", sdkCalls: ["@beosonic"], sourceRef: "a.ts:r" },
    { id: "soundstage_set", domain: "audio", object: "soundstage", action: "set",
      params: [{ name: "v", type: "number" }],
      safetyLevel: "controlled", sdkCalls: ["@beosonic"], sourceRef: "a.ts:s" },
    { id: "launch_app", domain: "app", object: "app", action: "launch",
      params: [{ name: "pkg", type: "string" }],
      safetyLevel: "controlled", sdkCalls: [], sourceRef: "adb.ts:l" },
    { id: "carinfo_read", domain: "vehicle", object: "vin", action: "read",
      params: [], safetyLevel: "readonly", sdkCalls: ["@sysprop"], sourceRef: "sysprop.ts:r" },
  ],
};

function dbusSpec(funcName: string) {
  return { type: "dbus", bus: "b", path: "p", method: "request", arg: { funcName }, reply: "json" };
}

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
  it("fails closed: empty capabilities (degenerate analysis) is NOT vacuously valid", () => {
    const r = validateConfig({}, { ...ANALYSIS, capabilities: [] });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("no capabilities");
  });
  it("accepts object reply descriptor with read + unwrap", () => {
    const config = {
      read_status: {
        type: "dbus", bus: "b", path: "p", method: "request",
        arg: { funcName: "read" },
        reply: { read: "json", unwrap: "result.data" },
      },
    };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
  it("rejects object reply descriptor missing read", () => {
    const config = {
      read_status: {
        type: "dbus", bus: "b", path: "p", method: "request",
        arg: { funcName: "read" },
        reply: { unwrap: "result.data" } as any,
      },
    };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("read_status");
    expect(r.errors.join("\n")).toContain("read");
  });
  it("rejects object reply descriptor with speculative field (coerce)", () => {
    const config = {
      read_status: {
        type: "dbus", bus: "b", path: "p", method: "request",
        arg: { funcName: "read" },
        reply: { read: "json", coerce: true } as any,
      },
    };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toMatch(/unknown.*reply.*field/i);
  });
});

describe("validateConfig — _deferred allowlist", () => {
  it("valid: _deferred exempts non-RPC capabilities from coverage", () => {
    const config = {
      soundstage_read: dbusSpec("ssr"),
      soundstage_set: dbusSpec("sss"),
      _deferred: {
        launch_app: "adb sendlink — 非 RPC 模型",
        carinfo_read: "sysprop native — 非 RPC 模型",
      },
    };
    const r = validateConfig(config, ANALYSIS_MIXED);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.deferred).toEqual(expect.arrayContaining(["launch_app", "carinfo_read"]));
    expect(r.deferred).toHaveLength(2);
  });

  it("valid: _deferred alone (no op) for a deferred capability — coverage exempt", () => {
    const config = {
      soundstage_read: dbusSpec("ssr"),
      soundstage_set: dbusSpec("sss"),
      _deferred: { launch_app: "adb sendlink — 非 RPC" },
    };
    const r = validateConfig(config, ANALYSIS_MIXED);
    expect(r.valid).toBe(false); // carinfo_read is NOT deferred and NOT in config
    expect(r.errors.join("\n")).toContain("carinfo_read");
    expect(r.deferred).toEqual(["launch_app"]);
  });

  it("invalid: non-deferred capability with no op still errors (coverage enforced)", () => {
    // Only soundstage_read has an op; soundstage_set/carinfo_read/launch_app missing, nothing deferred.
    const config = { soundstage_read: dbusSpec("ssr") };
    const r = validateConfig(config, ANALYSIS_MIXED);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("soundstage_set");
    expect(r.errors.join("\n")).toContain("carinfo_read");
    expect(r.errors.join("\n")).toContain("launch_app");
    expect(r.deferred).toEqual([]);
  });

  it("_deferred is not iterated as a capability (no spurious dispatchable errors)", () => {
    const config = {
      soundstage_read: dbusSpec("ssr"),
      soundstage_set: dbusSpec("sss"),
      launch_app: dbusSpec("la"), // give it an op anyway
      carinfo_read: dbusSpec("cr"),
      _deferred: { launch_app: "non-RPC" }, // deferred but also has an op — op wins, no error
    };
    const r = validateConfig(config, ANALYSIS_MIXED);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
    expect(r.deferred).toEqual(["launch_app"]);
  });

  it("non-object _deferred is ignored gracefully (treated as empty)", () => {
    const config: any = {
      soundstage_read: dbusSpec("ssr"),
      soundstage_set: dbusSpec("sss"),
      _deferred: "not-an-object",
    };
    const r = validateConfig(config, ANALYSIS_MIXED);
    expect(r.valid).toBe(false); // launch_app/carinfo_read missing, no valid deferred list
    expect(r.deferred).toEqual([]);
  });
});
describe("sampleArgs", () => {
  it("synthesizes by type, skips optional", () => {
    expect(sampleArgs([{ name: "n", type: "number" }, { name: "s", type: "string" }, { name: "b", type: "boolean" }, { name: "o", type: "string", optional: true }])).toEqual({ n: 1, s: "x", b: true });
  });
});
