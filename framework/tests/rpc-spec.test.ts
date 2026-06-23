import { describe, it, expect } from "vitest";
import { constructDbusCall, constructNativeCall } from "../src/rpc-spec.js";
import type { DbusSpec, NativeSpec } from "../src/rpc-spec.js";

describe("constructDbusCall", () => {
  it("interpolates ${vars} (type-preserving) and stringifies listed paths", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "com.yunos.audiopolicyservice", path: "/com/yunos/audiopolicyservice",
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
      type: "native", require: "yunos/device/AudioManager", factory: "getInstance",
      method: "setEQ", args: ["${band}", { expr: "${level} + 7" }],
    };
    const call = constructNativeCall(spec, { band: 3, level: 2 });
    expect(call.args).toEqual([3, 9]);
  });
});
