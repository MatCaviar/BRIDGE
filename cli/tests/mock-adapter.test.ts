import { describe, it, expect } from "vitest";
import { generateMockAdapter } from "../src/generators/mock-adapter.js";
import { generateMockAdapterTests } from "../src/generators/mock-adapter-tests.js";

// A realistic analysis with read + set capabilities whose DTOs are NOT the raw device shape.
// The mock must return the device envelope (PolicyResponse), forcing the adapter to unwrap.
const ANALYSIS = {
  app: { name: "t", domain: "d", framework: "YunOS HDT", entryFile: "i" },
  capabilities: [
    { id: "effects_read", domain: "ss", object: "effects", action: "read", params: [],
      returns: { type: "EffectsReadResult", fields: ["success", "mode", "fade", "balance"] },
      safetyLevel: "readonly", sdkCalls: [], sourceRef: "s" },
    { id: "volume_set", domain: "vol", object: "vol", action: "set",
      params: [{ name: "volume", type: "number" }],
      returns: { type: "VolumeSetResult", fields: ["success"] },
      safetyLevel: "normal", sdkCalls: [], sourceRef: "s" },
  ],
};

describe("mock-adapter returns device envelope shape (N11/N12)", () => {
  it("emits a PolicyResponse-style envelope for json read ops (not flat DTO defaults)", () => {
    const code = generateMockAdapter(ANALYSIS);
    // The mock must return { result: { data: { ... } } } so the adapter's unwrap proves itself.
    expect(code).toContain("result:");
    expect(code).toContain("data:");
  });
  it("emits a scalar for set ops (device returns double/int, 0 = success)", () => {
    const code = generateMockAdapter(ANALYSIS);
    // The set-op mock returns a scalar (0), not { success: true } — the adapter maps it.
    expect(code).toMatch(/resolve\(0\)|return\s+0/);
  });
});

describe("mock-adapter-tests assert unwrapping (no tautology — N11)", () => {
  it("emits a test that injects a realistic device response and asserts the extracted field", () => {
    const code = generateMockAdapterTests(ANALYSIS);
    // The test must reference the envelope shape (result.data) and assert a specific extracted
    // field value, NOT just result.success === true (the tautology we are removing).
    expect(code).toContain("result.data");
    expect(code).toContain("mode");
  });
});
