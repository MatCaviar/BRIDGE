import { describe, it, expect } from "vitest";
import { generateYunosAdapterRpc } from "../src/generators/yunos-adapter-rpc.js";

const SAMPLE = {
  app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" },
  capabilities: [
    { id: "soundstage_read", domain: "soundstage", object: "sound_stage", action: "read",
      returns: { type: "SoundstageReadResult", fields: ["success", "mode", "fade", "balance", "vncEnabled"] },
      safetyLevel: "readonly", sdkCalls: ["SoundStageManager.getSoundStage"], sourceRef: "ts/m.ts:get" },
    { id: "soundstage_set", domain: "soundstage", object: "sound_stage", action: "set",
      params: [{ name: "mode", type: "number" }, { name: "fade", type: "number", optional: true }],
      returns: { type: "SoundstageSetResult", fields: ["success", "mode", "fade"] },
      safetyLevel: "normal", sdkCalls: ["SoundStageManager.setSoundStage"], sourceRef: "ts/m.ts:set" },
  ],
};

describe("generateYunosAdapterRpc", () => {
  it("emits rpcCall(op) per method (no throw)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain('rpcFn("soundstage_read"');
    expect(code).toContain('rpcFn("soundstage_set"');
    expect(code).not.toContain("not implemented");
  });
  it("maps DTO by name with defaults (returns.fields)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain("vncEnabled");
    expect(code).toContain("defaultFor");
  });
  it("createYunosAdapter takes (adbConfig, rpcFn=defaultRpcCall)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain("createYunosAdapter(adbConfig");
    expect(code).toContain("rpcFn");
    expect(code).toContain("= defaultRpcCall)");
  });
});
