import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { tmpdir } from "os";
import { resolve, dirname, join } from "path";
import { generateAidlRegistry } from "../src/generators/aidl-registry.js";
import { validateAidlProvenance, validateAidlConstructibility, validateAidlCommand } from "../src/commands/validate-aidl.js";
import type { AnalysisData } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f: string) => readFileSync(resolve(here, "fixtures", "imaudio", f), "utf-8");
const aidl = fx("IIMAudioService.aidl");
const adapter = fx("IMAudioServiceAdapter.kt");
const types = fx("Types.kt");

// Truthful vs the real fixtures: one of each parse pattern.
const analysis = {
  app: { name: "imaudio", domain: "audio", framework: "android-kotlin", entryFile: "x", nativeCallTool: false, deviceSources: ["vin"] },
  capabilities: [
    { id: "set_mic_vocal", domain: "audio", object: "mic_vocal", action: "set", description: "x", safetyLevel: "normal", sdkCalls: [], sourceRef: "IMAudioServiceAdapter.kt:setMicVocal", pattern: "scalar", devicePaths: [], form: "binder", params: [{ name: "vol", type: "number" }] },
    { id: "query_sound_library", domain: "audio", object: "sound_library", action: "query", description: "x", safetyLevel: "readonly", sdkCalls: [], sourceRef: "IMAudioServiceAdapter.kt:querySoundLibrary", pattern: "envelope", devicePaths: ["body.vin"], form: "binder" },
    { id: "set_sound_stage", domain: "audio", object: "sound_stage", action: "set", description: "x", safetyLevel: "normal", sdkCalls: [], sourceRef: "IMAudioServiceAdapter.kt:setSoundStage", pattern: "dataclass", dataClass: "EffectModeAndFB", devicePaths: [], form: "binder", params: [{ name: "mode", type: "number" }] },
  ],
} as unknown as AnalysisData;

const registry = JSON.parse(generateAidlRegistry(analysis));
const clone = (o: any) => JSON.parse(JSON.stringify(o));

describe("Gate A — provenance & coverage", () => {
  it("passes on a truthful registry", () => {
    const r = validateAidlProvenance(clone(registry), { aidlText: aidl, adapterText: adapter });
    expect(r.valid, r.errors.join("\n")).toBe(true);
  });
  it("fails on a hallucinated methodName not in the AIDL", () => {
    const bad = clone(registry); bad.tools[0].methodName = "nopeNotReal";
    const r = validateAidlProvenance(bad, { aidlText: aidl, adapterText: adapter });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("not in AIDL");
  });
  it("fails when a declared pattern mismatches the adapter parse", () => {
    const bad = clone(registry); bad.tools[0].pattern = "envelope"; // setMicVocal is scalar
    const r = validateAidlProvenance(bad, { aidlText: aidl, adapterText: adapter });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("set_mic_vocal");
    expect(r.errors.join("\n")).toContain("pattern");
  });
  it("fails on a duplicate methodName", () => {
    const bad = clone(registry); bad.tools[1].methodName = "setMicVocal";
    const r = validateAidlProvenance(bad, { aidlText: aidl, adapterText: adapter });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("duplicate");
  });
  it("warns (does not fail) on AIDL business methods with no tool — respects curate selection", () => {
    const r = validateAidlProvenance(clone(registry), { aidlText: aidl, adapterText: adapter });
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0); // 23 AIDL methods, only 3 tooled
  });
});

describe("Gate B — constructibility", () => {
  it("passes on a truthful registry (dataClass exists, devicePath leaf declared)", () => {
    const r = validateAidlConstructibility(clone(registry), { typesKtText: types });
    expect(r.valid, r.errors.join("\n")).toBe(true);
  });
  it("fails when a dataclass names a type absent from Types.kt", () => {
    const bad = clone(registry); bad.tools[2].dataClass = "HallucinatedClass";
    const r = validateAidlConstructibility(bad, { typesKtText: types });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("Types.kt");
  });
  it("fails when a dataclass tool has no dataClass", () => {
    const bad = clone(registry); delete bad.tools[2].dataClass;
    const r = validateAidlConstructibility(bad, { typesKtText: types });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("dataClass");
  });
  it("fails when a devicePath leaf is not declared in app.deviceSources", () => {
    const bad = clone(registry); bad.deviceSources = [];
    const r = validateAidlConstructibility(bad, { typesKtText: types });
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("body.vin");
  });
});

describe("validate_aidl command", () => {
  let tmp: string;
  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), "vaidl-cmd-"));
    writeFileSync(join(tmp, "registry.json"), generateAidlRegistry(analysis));
  });
  const SRC = ["--aidl", resolve(here, "fixtures", "imaudio", "IIMAudioService.aidl"), "--adapter", resolve(here, "fixtures", "imaudio", "IMAudioServiceAdapter.kt"), "--types", resolve(here, "fixtures", "imaudio", "Types.kt")];

  it("resolves on a truthful registry (prints feedback)", async () => {
    await expect(validateAidlCommand([join(tmp, "registry.json"), ...SRC])).resolves.toBeUndefined();
  });
  it("throws Usage on missing flags", async () => {
    await expect(validateAidlCommand(["x.json"])).rejects.toThrow(/Usage:/);
  });
  it("throws actionable errors when a pattern mismatches (names the field to fix)", async () => {
    const bad = clone(registry); bad.tools[0].pattern = "envelope";
    writeFileSync(join(tmp, "bad.json"), JSON.stringify(bad));
    await expect(validateAidlCommand([join(tmp, "bad.json"), ...SRC])).rejects.toThrow(/pattern/);
  });
});
