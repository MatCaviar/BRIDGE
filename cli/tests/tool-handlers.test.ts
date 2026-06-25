import { describe, it, expect } from "vitest";
import { generateToolHandlers } from "../src/generators/tool-handlers.js";

const ANALYSIS_WITH_CODES = {
  app: { name: "t", domain: "d", framework: "YunOS HDT", entryFile: "i" },
  capabilities: [
    { id: "volume_set", domain: "audio", object: "vol", action: "set",
      params: [{ name: "volume", type: "number" }],
      returns: { type: "VolumeSetResult", fields: ["success"] },
      safetyLevel: "normal", sdkCalls: [], sourceRef: "s" },
    { id: "volume_read", domain: "audio", object: "vol", action: "read",
      params: [], returns: { type: "VolumeReadResult", fields: ["volume"] },
      safetyLevel: "readonly", sdkCalls: [], sourceRef: "s" },
  ],
  errorCodes: {
    audio: { prefix: 2, domainName: "audio",
      codes: {
        SDK_UNAVAILABLE: { value: 1, message: "x" },
        SET_FAILED: { value: 3, message: "x" },
        GET_FAILED: { value: 4, message: "x" },
      } },
  },
};

const ANALYSIS_NO_CODES = {
  app: { name: "t", domain: "d", framework: "YunOS HDT", entryFile: "i" },
  capabilities: [
    { id: "volume_set", domain: "audio", object: "vol", action: "set",
      params: [{ name: "volume", type: "number" }],
      returns: { type: "VolumeSetResult", fields: ["success"] },
      safetyLevel: "normal", sdkCalls: [], sourceRef: "s" },
  ],
};

describe("generateToolHandlers — error codes (C1)", () => {
  it("uses domain error codes (AUDIO_SET_FAILED=2003), never literal 1000", () => {
    const files = generateToolHandlers(ANALYSIS_WITH_CODES as never);
    const code = files.get("src/tools/audio.ts")!;
    expect(code).toContain("AUDIO_SET_FAILED");
    expect(code).toContain("AUDIO_GET_FAILED");
    expect(code).not.toMatch(/\b1000\b/);  // the dead literal is gone
  });
  it("maps device RpcError.code → a generated domain code (translate RPC_ERROR etc.)", () => {
    const files = generateToolHandlers(ANALYSIS_WITH_CODES as never);
    const code = files.get("src/tools/audio.ts")!;
    // A device RpcError carries .code (string); the handler must translate it, not pass the string raw.
    expect(code).toContain("RpcError");
    expect(code).toContain("error.code");
  });
  it("falls back to a synthetic generic code (not literal 1000) when analysis has no errorCodes", () => {
    const files = generateToolHandlers(ANALYSIS_NO_CODES as never);
    const code = files.get("src/tools/audio.ts")!;
    expect(code).not.toMatch(/\b1000\b/);
    // No errorCodes → emit a per-domain generic constant (e.g. AUDIO_GENERIC = <prefix*1000> or a stable hash).
    expect(code).toMatch(/AUDIO_GENERIC|GENERIC/);
  });
});
