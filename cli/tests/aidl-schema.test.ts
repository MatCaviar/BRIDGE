import { describe, it, expect } from "vitest";
import { validateAnalysis } from "../src/commands/validate.js";

// A real-shaped Android/Kotlin+AIDL analysis exercising the new substrate fields.
const androidAnalysis = {
  app: {
    name: "imaudio",
    domain: "audio",
    framework: "android-kotlin",
    entryFile: "src/main/java/com/immotors/imaudio/MainActivity.kt",
    nativeCallTool: false,
    deviceSources: ["vin"],
  },
  capabilities: [
    {
      id: "set_mic_vocal",
      domain: "audio",
      object: "mic_vocal",
      action: "set",
      description: "调整车内麦克风人声输出音量。",
      safetyLevel: "normal",
      sdkCalls: [],
      sourceRef: "IMAudioServiceAdapter.kt:setMicVocal",
      pattern: "scalar",
      devicePaths: [],
      form: "binder",
      params: [{ name: "vol", type: "number" }],
    },
    {
      id: "query_sound_library",
      domain: "audio",
      object: "sound_library",
      action: "query",
      description: "查询音库列表。",
      safetyLevel: "readonly",
      sdkCalls: [],
      sourceRef: "IMAudioServiceAdapter.kt:querySoundLibrary",
      pattern: "envelope",
      devicePaths: ["body.vin"],
      form: "binder",
    },
  ],
};

describe("Android/AIDL substrate — schema acceptance", () => {
  it("validates an android-kotlin analysis carrying nativeCallTool + pattern/devicePaths/form", () => {
    const r = validateAnalysis(androidAnalysis);
    expect(r.valid, r.errors.map((e) => `${e.path}: ${e.message}`).join("\n")).toBe(true);
  });

  it("rejects an unknown pattern", () => {
    const bad = JSON.parse(JSON.stringify(androidAnalysis));
    bad.capabilities[0].pattern = "bogus";
    expect(validateAnalysis(bad).valid).toBe(false);
  });

  it("rejects an unknown form", () => {
    const bad = JSON.parse(JSON.stringify(androidAnalysis));
    bad.capabilities[0].form = "weird";
    expect(validateAnalysis(bad).valid).toBe(false);
  });

  it("rejects an unknown framework", () => {
    const bad = JSON.parse(JSON.stringify(androidAnalysis));
    bad.app.framework = "ios-swift";
    expect(validateAnalysis(bad).valid).toBe(false);
  });
});
