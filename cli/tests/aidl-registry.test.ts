import { describe, it, expect } from "vitest";
import { generateAidlRegistry } from "../src/generators/aidl-registry.js";
import type { AnalysisData } from "../src/types.js";

const analysis = {
  app: { name: "imaudio", domain: "audio", framework: "android-kotlin", entryFile: "x", nativeCallTool: false, deviceSources: ["vin"] },
  capabilities: [
    { id: "set_mic_vocal", domain: "audio", object: "mic_vocal", action: "set", description: "x", safetyLevel: "normal", sdkCalls: [], sourceRef: "IMAudioServiceAdapter.kt:setMicVocal", pattern: "scalar", devicePaths: [], form: "binder" },
    { id: "query_sound_library", domain: "audio", object: "sound_library", action: "query", description: "x", safetyLevel: "readonly", sdkCalls: [], sourceRef: "IMAudioServiceAdapter.kt:querySoundLibrary", pattern: "envelope", devicePaths: ["body.vin"], form: "binder" },
  ],
} as unknown as AnalysisData;

describe("generateAidlRegistry", () => {
  it("projects one tool per capability with methodName/pattern/devicePaths/form", () => {
    const json = JSON.parse(generateAidlRegistry(analysis));
    expect(json.app).toBe("imaudio");
    expect(json.framework).toBe("android-kotlin");
    expect(json.nativeCallTool).toBe(false);
    expect(json.deviceSources).toEqual(["vin"]);
    expect(json.tools).toHaveLength(2);

    const mic = json.tools.find((t: any) => t.id === "set_mic_vocal");
    expect(mic.methodName).toBe("setMicVocal"); // methodName derived from sourceRef, not the snake_case id
    expect(mic.pattern).toBe("scalar");
    expect(mic.devicePaths).toEqual([]);
    expect(mic.form).toBe("binder");
    expect(mic.safetyLevel).toBe("normal");

    const q = json.tools.find((t: any) => t.id === "query_sound_library");
    expect(q.methodName).toBe("querySoundLibrary");
    expect(q.pattern).toBe("envelope");
    expect(q.devicePaths).toEqual(["body.vin"]);
  });

  it("defaults missing optional fields: pattern→none, form→binder, status→verified", () => {
    const minimal = {
      app: { name: "a", domain: "d", framework: "android-kotlin", entryFile: "x" },
      capabilities: [{ id: "get_x", domain: "d", object: "x", action: "get", description: "x", safetyLevel: "readonly", sdkCalls: [], sourceRef: "F.kt:getX" }],
    } as unknown as AnalysisData;
    const t = JSON.parse(generateAidlRegistry(minimal)).tools[0];
    expect(t.pattern).toBe("none");
    expect(t.form).toBe("binder");
    expect(t.status).toBe("verified");
    expect(t.devicePaths).toEqual([]);
  });

  it("emits valid JSON (registry.json is machine-read by the car executor + gates)", () => {
    expect(() => JSON.parse(generateAidlRegistry(analysis))).not.toThrow();
  });
});
