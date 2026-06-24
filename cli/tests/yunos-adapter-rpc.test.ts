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
    { id: "generate_qr", domain: "qr", object: "qr_code", action: "generate",
      params: [{ name: "data", type: "string" }],
      returns: { type: "GenerateQrResult", fields: ["success", "qrCodeUrl"] },
      safetyLevel: "normal", sdkCalls: ["Qr.generate"], sourceRef: "ts/q.ts:gen" },
  ],
};

describe("generateYunosAdapterRpc", () => {
  it("emits rpcCall(op) per method (no throw)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain('rpcFn("soundstage_read"');
    expect(code).toContain('rpcFn("soundstage_set"');
    expect(code).not.toContain("not implemented");
  });
  it("maps DTO by name with type-aware baked defaults (no runtime defaultFor)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain("vncEnabled");
    expect(code).not.toContain("defaultFor");   // removed — defaults baked at gen time
    expect(code).toContain("?? 0");             // number fields (fade/balance) default to 0
    expect(code).toContain("?? false");         // boolean fields (vncEnabled) default to false
  });
  it("createYunosAdapter takes (adbConfig, rpcFn=defaultRpcCall)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain("createYunosAdapter(adbConfig");
    expect(code).toContain("rpcFn");
    expect(code).toContain("= defaultRpcCall)");
  });
  it("method body var never collides with a param named 'data' (no TS duplicate identifier)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    // the host-facing param stays 'data' …
    expect(code).toContain("generateQrCode(data: string)");
    expect(code).toContain('rpcFn("generate_qr", { data }');
    // … but the body local is renamed, so no `const data =` duplicate
    expect(code).not.toContain("const data = await rpcFn");
    expect(code).toContain("const rpcResult = await rpcFn");
  });
});
