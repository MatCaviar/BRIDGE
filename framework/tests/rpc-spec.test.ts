import { describe, it, expect } from "vitest";
import { constructDbusCall, constructNativeCall, buildWrites, readReply } from "../src/rpc-spec.js";
import type { DbusSpec, NativeSpec } from "../src/rpc-spec.js";

describe("constructDbusCall", () => {
  it("interpolates ${vars} (type-preserving) and stringifies listed paths", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "com.example.featureservice", path: "/com/example/featureservice",
      method: "request",
      arg: { funcName: "setMode", data: { mode: "${mode}", fade: "${fade}" } },
      stringify: ["data"], reply: "json",
    };
    const call = constructDbusCall(spec, { mode: 1, fade: 0 });
    const arg = JSON.parse(call.argString);
    expect(typeof arg.data).toBe("string");
    expect(JSON.parse(arg.data)).toEqual({ mode: 1, fade: 0 });
  });
});

describe("constructNativeCall", () => {
  it("resolves ${var} (type-preserving) and expr transforms", () => {
    const spec: NativeSpec = {
      type: "native", require: "demo/device/FeatureManager", factory: "getInstance",
      method: "setFeature", args: ["${band}", { expr: "${level} + 7" }],
    };
    const call = constructNativeCall(spec, { band: 3, level: 2 });
    expect(call.args).toEqual([3, 9]);
  });
  it("throws 'bad expr' on non-arithmetic input (blocks Function() injection)", () => {
    const spec: NativeSpec = { type: "native", require: "x", method: "m", args: [{ expr: "process.exit(1)" }] };
    expect(() => constructNativeCall(spec, {})).toThrow(/bad expr/);
  });
  it("falls back missing expr vars to 0", () => {
    const spec: NativeSpec = { type: "native", require: "x", method: "m", args: [{ expr: "${missing} + 1" }] };
    expect(constructNativeCall(spec, {}).args).toEqual([1]);
  });
});

describe("buildWrites", () => {
  it("positional writes: ordered, interpolated, kind-preserving", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "music.svc", path: "/music", method: "getCardContent",
      arg: {}, reply: "json",
      writes: [
        { kind: "string", value: "${cpId}" },
        { kind: "string", value: "${requestType}" },
        { kind: "int32", value: "${pageNo}" },
        { kind: "int32", value: "${pageSize}" },
      ],
    };
    const writes = buildWrites(spec, { cpId: "qq", requestType: "album", pageNo: 1, pageSize: 20 });
    expect(writes).toEqual([
      { kind: "string", value: "qq" },
      { kind: "string", value: "album" },
      { kind: "int32", value: 1 },
      { kind: "int32", value: 20 },
    ]);
  });

  it("bare-string write (kind:string) is NOT json-wrapped — fixes getDefaultCp corruption", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "music.svc", path: "/music", method: "getDefaultCp",
      arg: {}, reply: "string", writes: [{ kind: "string", value: "${cpType}" }],
    };
    const [w] = buildWrites(spec, { cpType: "music" });
    expect(w).toEqual({ kind: "string", value: "music" });
  });

  it("backward-compat: no writes → single json write with stringify applied", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "x", path: "/x", method: "request",
      arg: { funcName: "set", data: { mode: "${mode}" } }, stringify: ["data"], reply: "json",
    };
    const writes = buildWrites(spec, { mode: 9 });
    expect(writes).toHaveLength(1);
    expect(writes[0].kind).toBe("json");
    expect(JSON.parse((writes[0].value as { data: string }).data)).toEqual({ mode: 9 });
  });
});

describe("readReply", () => {
  const mockReader = (reads: unknown[]) => ({
    readJSON: () => reads[0], readString: () => reads[1], readInt32: () => reads[2], readDouble: () => reads[3], readBool: () => reads[4],
  });
  it("replyParts: reads segments in order, returns array", () => {
    const spec = { reply: "json", replyParts: [{ kind: "string" }, { kind: "int32" }] } as DbusSpec;
    expect(readReply(spec, mockReader(["j", "s", 42, 1.5, true]))).toEqual(["s", 42]);
  });
  it("no replyParts: single read by reply kind", () => {
    const spec = { reply: "double" } as DbusSpec;
    expect(readReply(spec, mockReader(["j", "s", 42, 1.5, true]))).toBe(1.5);
  });
});

describe("device variables", () => {
  it("resolves ${__device__.x} from args.__device__ (nested)", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "imaudio.alios.cn", path: "/imaudio/alios/cn", method: "query",
      arg: { body: { vin: "${__device__.vin}" } }, reply: "json",
    };
    expect(JSON.parse(constructDbusCall(spec, { __device__: { vin: "LS123" } }).argString)).toEqual({ body: { vin: "LS123" } });
  });
  it("fail-closed: unresolved ${__device__.x} throws (never leaks the marker)", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "x", path: "/x", method: "m",
      arg: { token: "${__device__.token}" }, reply: "json",
    };
    expect(() => constructDbusCall(spec, { __device__: {} })).toThrow(/unresolved device variable/);
  });
});

describe("interface override", () => {
  it("carries spec.interface as interfaceOverride", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "b", path: "/p", method: "request",
      interface: "cn.alios.custom.iface", arg: { x: 1 }, reply: "json",
    };
    expect(constructDbusCall(spec, {}).interfaceOverride).toBe("cn.alios.custom.iface");
  });
  it("interfaceOverride undefined when spec.interface absent", () => {
    const spec: DbusSpec = { type: "dbus", bus: "b", path: "/p", method: "m", arg: {}, reply: "json" };
    expect(constructDbusCall(spec, {}).interfaceOverride).toBeUndefined();
  });
});
