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

// The generator emits an extraction function derived from the op's reply descriptor.
// These tests assert the EMITTED CODE contains the right extraction for each shape.
// (Behavioral end-to-end extraction is covered by the generated-fixture test in Task 4.)

describe("generateYunosAdapterRpc — descriptor-aware extraction (C2)", () => {
  it("emits unwrap for { read: 'json', unwrap: 'result.data' }", () => {
    // soundstage_read returns { result: { data: { mode, fade, balance } } }
    const code = generateYunosAdapterRpc(SAMPLE);
    // The emitted adapter must support descriptor-driven unwrap (dotted path into the read value).
    // unwrap is runtime-config-driven (read from rpc/config.json), so the generator emits the
    // dotted-path walker getByPath + the `unwrap` field plumbing — NOT the literal "result.data".
    expect(code).toContain("getByPath");
    expect(code).toContain("unwrap");
    expect(code).toContain("function applyReply");
  });
  it("emits scalar success mapping for set ops with read 'double' + valueField", () => {
    // A set op whose reply is { read: 'double', valueField: 'success' } → map 0→success:true, non-0→false.
    const setSample = {
      app: { name: "t", domain: "d", framework: "YunOS HDT", entryFile: "i" },
      capabilities: [{
        id: "volume_set", domain: "volume", object: "vol", action: "set",
        params: [{ name: "volume", type: "number" }],
        returns: { type: "VolumeSetResult", fields: ["success"] },
        safetyLevel: "normal", sdkCalls: [], sourceRef: "s",
      }],
    };
    const code = generateYunosAdapterRpc(setSample);
    // The generator cannot read config here, but it MUST emit a helper that the runtime
    // adapter can drive with the descriptor. We assert the emitted extraction helper exists
    // and handles scalar→valueField (0 = success for set ops).
    expect(code).toContain("function applyReply");
    expect(code).toContain("valueField");
  });
  it("emits parseJson for read 'string' + parseJson:true", () => {
    const readSample = {
      app: { name: "t", domain: "d", framework: "YunOS HDT", entryFile: "i" },
      capabilities: [{
        id: "mic_vocal_read", domain: "mic", object: "mic", action: "read",
        params: [],
        returns: { type: "MicResult", fields: ["volume"] },
        safetyLevel: "readonly", sdkCalls: [], sourceRef: "s",
      }],
    };
    const code = generateYunosAdapterRpc(readSample);
    expect(code).toContain("parseJson");
    expect(code).toContain("JSON.parse");
  });
});
