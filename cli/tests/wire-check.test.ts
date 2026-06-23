import { describe, it, expect } from "vitest";
import { wireCheck, extractExpectedWire } from "../src/commands/wire-check.js";

const PROXY_SRC = `
getSoundStage() {
  let msg = this._iface.createMethodCallMessage("request");
  const params = { funcName: "audiopolicyservice.yunos.com/baseModeules/requstGetSoundEffectsMode" };
  msg.writeString(JSON.stringify(params));
  let data = result.readJSON();
}`;
const CONFIG = {
  soundstage_read: { type: "dbus", bus: "com.yunos.audiopolicyservice", path: "/com/yunos/audiopolicyservice",
    method: "request", arg: { funcName: "audiopolicyservice.yunos.com/baseModeules/requstGetSoundEffectsMode" }, reply: "json" },
};

describe("wireCheck", () => {
  it("extractExpectedWire pulls funcName + method from common proxy pattern", () => {
    const wires = extractExpectedWire(PROXY_SRC);
    expect(wires.length).toBeGreaterThan(0);
    expect(wires[0].method).toBe("request");
    expect(wires[0].arg.funcName).toContain("requstGetSoundEffectsMode");
  });
  it("valid when config matches extracted wire", () => {
    expect(wireCheck(CONFIG, PROXY_SRC).valid).toBe(true);
  });
  it("invalid when config funcName diverges", () => {
    const bad = { soundstage_read: { ...CONFIG.soundstage_read, arg: { funcName: "WRONG" } } };
    expect(wireCheck(bad, PROXY_SRC).valid).toBe(false);
  });
});
