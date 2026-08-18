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
  it("invalid: unknown config op is not silently ignored", () => {
    const config = {
      read_status: dbusSpec("read"),
      ghost_status: dbusSpec("ghost"),
    };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("unknown config op: ghost_status");
  });
  it("invalid: dbus templates may only reference declared params", () => {
    const config = {
      read_status: {
        type: "dbus",
        bus: "b",
        path: "p",
        method: "request",
        arg: { funcName: "read", body: { mode: "${mode}", missing: "${missingParam}" } },
        reply: "json",
      },
    };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("unknown template variable missingParam");
  });
  it("invalid: dbus specs must declare bus/path/method/reply", () => {
    const config = {
      read_status: { type: "dbus", bus: "", path: "p", method: "request", arg: {}, reply: "json" },
    };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("dbus.bus must be a non-empty string");
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

  it("invalid: _deferred may only name known capabilities", () => {
    const config = {
      soundstage_read: dbusSpec("ssr"),
      soundstage_set: dbusSpec("sss"),
      launch_app: dbusSpec("la"),
      carinfo_read: dbusSpec("cr"),
      _deferred: { ghost_capability: "not real" },
    };
    const r = validateConfig(config, ANALYSIS_MIXED);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("unknown _deferred capability: ghost_capability");
  });
});
describe("validateConfig — Phase 2 (writes/replyParts/device vars)", () => {
  const DEV_ANALYSIS = {
    app: { name: "devapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts", deviceSources: ["vin"] },
    capabilities: [
      { id: "get_content", domain: "music", object: "card", action: "get",
        params: [{ name: "cpId", type: "string" }, { name: "pageNo", type: "number" }],
        safetyLevel: "readonly", sdkCalls: ["ubus"], sourceRef: "p.ts:g" },
      { id: "query", domain: "audio", object: "lib", action: "query",
        params: [], safetyLevel: "readonly", sdkCalls: ["ubus"], sourceRef: "p.ts:q" },
    ],
  };
  const queryOp = { type: "dbus", bus: "m", path: "/m", method: "query", arg: {}, reply: "json" };

  it("valid: positional writes[] with no arg", () => {
    const r = validateConfig({
      get_content: { type: "dbus", bus: "m", path: "/m", method: "getCardContent",
        writes: [{ kind: "string", value: "${cpId}" }, { kind: "int32", value: "${pageNo}" }], reply: "json" },
      query: queryOp,
    }, DEV_ANALYSIS);
    expect(r.valid).toBe(true);
  });

  it("invalid: writes[] with bad kind", () => {
    const r = validateConfig({
      get_content: { type: "dbus", bus: "m", path: "/m", method: "g", writes: [{ kind: "blob", value: "${cpId}" }], reply: "json" },
      query: queryOp,
    }, DEV_ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("writes[0].kind");
  });

  it("valid: replyParts multi-read", () => {
    const r = validateConfig({
      get_content: { type: "dbus", bus: "m", path: "/m", method: "g", writes: [{ kind: "string", value: "${cpId}" }], reply: "string", replyParts: [{ kind: "string" }, { kind: "int32" }] },
      query: queryOp,
    }, DEV_ANALYSIS);
    expect(r.valid).toBe(true);
  });

  it("invalid: replyParts with bad kind", () => {
    const r = validateConfig({
      get_content: { type: "dbus", bus: "m", path: "/m", method: "g", writes: [{ kind: "string", value: "${cpId}" }], reply: "json", replyParts: [{ kind: "xml" }] },
      query: queryOp,
    }, DEV_ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("replyParts[0].kind");
  });

  it("valid: ${__device__.vin} declared in app.deviceSources", () => {
    const r = validateConfig({
      get_content: { type: "dbus", bus: "m", path: "/m", method: "g", arg: { body: { vin: "${__device__.vin}" } }, reply: "json" },
      query: queryOp,
    }, DEV_ANALYSIS);
    expect(r.valid).toBe(true);
  });

  it("invalid: ${__device__.token} NOT declared in app.deviceSources (fail-closed at gate)", () => {
    const r = validateConfig({
      get_content: { type: "dbus", bus: "m", path: "/m", method: "g", arg: { token: "${__device__.token}" }, reply: "json" },
      query: queryOp,
    }, DEV_ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("undeclared device source");
  });
});

describe("sampleArgs", () => {
  it("synthesizes by type, skips optional", () => {
    expect(sampleArgs([{ name: "n", type: "number" }, { name: "s", type: "string" }, { name: "b", type: "boolean" }, { name: "o", type: "string", optional: true }])).toEqual({ n: 1, s: "x", b: true });
  });
  it("honors defaultValue over synthetic", () => {
    expect(sampleArgs([{ name: "lvl", type: "number", defaultValue: 7 }])).toEqual({ lvl: 7 });
  });
  it("array types → empty array (not the legacy 'x' string)", () => {
    expect(sampleArgs([{ name: "ids", type: "string[]" }, { name: "items", type: "Array<{x:number}>" }])).toEqual({ ids: [], items: [] });
  });
  it("object/named-model types → empty object", () => {
    expect(sampleArgs([{ name: "info", type: "EqualizerItemModel" }])).toEqual({ info: {} });
  });
  it("named enum resolves to first wire value (numeric for number enums)", () => {
    const enums = { Gear: { values: ["P", "R"], type: "string" }, Mode: { values: ["0", "9"], type: "number" } };
    expect(sampleArgs([{ name: "g", type: "Gear" }, { name: "m", type: "Mode" }], enums)).toEqual({ g: "P", m: 0 });
  });
});
