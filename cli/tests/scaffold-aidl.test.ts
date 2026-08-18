import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { scaffoldProject } from "../src/commands/scaffold.js";
import type { AnalysisData } from "../src/types.js";

const android = {
  app: { name: "imaudio", domain: "audio", framework: "android-kotlin", entryFile: "src/MainActivity.kt", nativeCallTool: false, deviceSources: ["vin"] },
  capabilities: [
    { id: "set_mic_vocal", domain: "audio", object: "mic_vocal", action: "set", description: "adjust mic vocal volume", safetyLevel: "normal", sdkCalls: [], sourceRef: "IMAudioServiceAdapter.kt:setMicVocal", pattern: "scalar", devicePaths: [], form: "binder" },
  ],
} as unknown as AnalysisData;

const yunos = {
  app: { name: "aipet", domain: "pet", framework: "YunOS HDT", entryFile: "app.ts" },
  capabilities: [
    { id: "feed_pet", domain: "pet", object: "pet", action: "feed", description: "feed the pet", safetyLevel: "normal", sdkCalls: [], sourceRef: "AProxy.ts:feed" },
  ],
} as unknown as AnalysisData;

describe("scaffold substrate branch", () => {
  it("android-kotlin: emits car-side/registry.json, skips agil RpcEngine, keeps host rpc-client", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-aidl-"));
    scaffoldProject(android, dir);
    expect(existsSync(join(dir, "car-side", "registry.json"))).toBe(true);
    const reg = JSON.parse(readFileSync(join(dir, "car-side", "registry.json"), "utf-8"));
    expect(reg.tools[0].methodName).toBe("setMicVocal");
    expect(reg.framework).toBe("android-kotlin");
    expect(existsSync(join(dir, "car-side", "RpcEngine.ts"))).toBe(false); // agil page skipped
    expect(existsSync(join(dir, "car-side", "manifest-page.json"))).toBe(false);
    expect(existsSync(join(dir, "src", "rpc", "rpc-client.ts"))).toBe(true); // host compile dep retained
  });

  it("YunOS HDT (control, regression): emits agil RpcEngine, no registry.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "scaffold-yunos-"));
    scaffoldProject(yunos, dir);
    expect(existsSync(join(dir, "car-side", "RpcEngine.ts"))).toBe(true);
    expect(existsSync(join(dir, "car-side", "manifest-page.json"))).toBe(true);
    expect(existsSync(join(dir, "car-side", "registry.json"))).toBe(false);
  });
});
