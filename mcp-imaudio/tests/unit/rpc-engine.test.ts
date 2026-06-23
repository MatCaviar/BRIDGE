import { describe, it, expect } from "vitest";
import { constructDbusCall, constructNativeCall } from "../../src/rpc/rpc-engine.js";
import type { DbusSpec, NativeSpec } from "../../src/rpc/rpc-engine.js";

describe("constructDbusCall", () => {
  it("interpolates ${vars} and stringifies listed paths", () => {
    const spec: DbusSpec = {
      type: "dbus",
      bus: "com.yunos.audiopolicyservice",
      path: "/com/yunos/audiopolicyservice",
      method: "request",
      arg: {
        funcName: "audiopolicyservice.yunos.com/baseModeules/requstSetSoundEffectsMode",
        data: { mode: "${mode}", fade: "${fade}", balance: "${balance}" },
      },
      stringify: ["data"],
      reply: "json",
    };
    const call = constructDbusCall(spec, { mode: 1, fade: 0, balance: 0 });
    expect(call.bus).toBe("com.yunos.audiopolicyservice");
    expect(call.method).toBe("request");
    expect(call.reply).toBe("json");
    const arg = JSON.parse(call.argString);
    expect(arg.funcName).toContain("requstSetSoundEffectsMode");
    expect(typeof arg.data).toBe("string");
    expect(JSON.parse(arg.data)).toEqual({ mode: 1, fade: 0, balance: 0 });
  });

  it("no-op without stringify", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "b", path: "p", method: "request",
      arg: { funcName: "get" }, reply: "json",
    };
    const call = constructDbusCall(spec, {});
    expect(JSON.parse(call.argString)).toEqual({ funcName: "get" });
  });
});

describe("constructNativeCall", () => {
  it("resolves ${var} args and expr transforms", () => {
    const spec: NativeSpec = {
      type: "native",
      require: "yunos/device/AudioManager",
      factory: "getInstance",
      method: "setAudioEffectCustomizedEQ",
      args: ["${band}", "${centerFreq}", { expr: "${bandLevel} + 7" }],
    };
    const call = constructNativeCall(spec, { band: 3, centerFreq: 500, bandLevel: 2 });
    expect(call.require).toBe("yunos/device/AudioManager");
    expect(call.factory).toBe("getInstance");
    expect(call.method).toBe("setAudioEffectCustomizedEQ");
    expect(call.args).toEqual([3, 500, 9]); // bandLevel 2 + 7 = 9
  });
});
