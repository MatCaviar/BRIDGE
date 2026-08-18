import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, dirname } from "path";
import { parseAidlMethods, detectAdapterPattern, parseDataClasses } from "../src/aidl-source.js";

const here = dirname(fileURLToPath(import.meta.url));
const fx = (f: string) => readFileSync(resolve(here, "fixtures", "imaudio", f), "utf-8");
const aidl = fx("IIMAudioService.aidl");
const adapter = fx("IMAudioServiceAdapter.kt");
const types = fx("Types.kt");

describe("parseAidlMethods", () => {
  const methods = parseAidlMethods(aidl);
  it("lists exactly the 23 business methods", () => {
    expect(methods.size).toBe(23);
  });
  it("includes business methods, excludes callback lifecycle", () => {
    expect(methods.has("querySoundLibrary")).toBe(true);
    expect(methods.has("setMicVocal")).toBe(true);
    expect(methods.has("getSpeedVolumeStatus")).toBe(true);
    expect(methods.has("registerCallback")).toBe(false);
    expect(methods.has("unregisterCallback")).toBe(false);
  });
});

describe("detectAdapterPattern", () => {
  it("envelope for parseRequest methods", () => {
    expect(detectAdapterPattern(adapter, "querySoundLibrary")).toBe("envelope");
    expect(detectAdapterPattern(adapter, "deleteEffect")).toBe("envelope");
  });
  it("scalar for parseJsonObject methods", () => {
    expect(detectAdapterPattern(adapter, "setMicVocal")).toBe("scalar");
    expect(detectAdapterPattern(adapter, "setCarAndHeadrestVolume")).toBe("scalar");
  });
  it("dataclass for fromJson<T> methods", () => {
    expect(detectAdapterPattern(adapter, "setSoundStage")).toBe("dataclass");
    expect(detectAdapterPattern(adapter, "setBeosonicPoint")).toBe("dataclass");
    expect(detectAdapterPattern(adapter, "queryEffectLibrary")).toBe("dataclass");
  });
  it("none for no-param getters", () => {
    expect(detectAdapterPattern(adapter, "getMicVocal")).toBe("none");
    expect(detectAdapterPattern(adapter, "getSoundStage")).toBe("none");
  });
  it("undefined for a method not present", () => {
    expect(detectAdapterPattern(adapter, "nopeNotReal")).toBeUndefined();
  });
  it("the LAST override fun doesn't bleed into trailing helper defs (setSpeedVolumeStatus stub → scalar)", () => {
    // setSpeedVolumeStatus is the last method; after it come parseRequest/parseJsonObject helpers.
    // The body must be bounded so it doesn't read those helpers and mis-classify as envelope/dataclass.
    expect(detectAdapterPattern(adapter, "setSpeedVolumeStatus")).toBe("scalar");
    expect(detectAdapterPattern(adapter, "getSpeedVolumeStatus")).toBe("none");
  });
});

describe("parseDataClasses", () => {
  const dc = parseDataClasses(types);
  it("BeosonicPoint → {x,y,z}", () => {
    expect(dc.get("BeosonicPoint")).toEqual(new Set(["x", "y", "z"]));
  });
  it("EffectModeAndFB has mode/fade/balance", () => {
    const f = dc.get("EffectModeAndFB")!;
    expect(f.has("mode")).toBe(true);
    expect(f.has("fade")).toBe(true);
    expect(f.has("balance")).toBe(true);
  });
  it("ICloudServiceRequest has body/headers/options", () => {
    const f = dc.get("ICloudServiceRequest")!;
    for (const n of ["body", "headers", "options"]) expect(f.has(n)).toBe(true);
  });
  it("QuerySoundLibraryParam has vin", () => {
    expect(dc.get("QuerySoundLibraryParam")!.has("vin")).toBe(true);
  });
});
