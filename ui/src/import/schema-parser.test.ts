import { describe, expect, it } from "vitest";
import { filterSourceFiles, parseTargetSchema } from "./schema-parser";

describe("parseTargetSchema", () => {
  it("preserves a normal JSON Schema object", () => {
    expect(parseTargetSchema('{"type":"object","properties":{"state":{"type":"string"}}}')).toMatchObject({ type: "object" });
  });

  it("normalizes concatenated tool descriptors into one envelope", () => {
    const parsed = parseTargetSchema('{"name":"reading_light","arguments":{}}\n{"name":"car_light","arguments":{}}');
    expect(parsed).toMatchObject({ format: "mcp-tool-list" });
    expect((parsed.tools as Array<{ name: string }>).map((tool) => tool.name)).toEqual(["reading_light", "car_light"]);
  });

  it("reports the byte offset for malformed input", () => {
    expect(() => parseTargetSchema('{"name":"broken"')).toThrow(/offset/i);
  });
});

describe("filterSourceFiles", () => {
  it("keeps Android source and descriptors while excluding build products and binaries", () => {
    const files = [
      { name: "Controller.kt", webkitRelativePath: "demo/local_service/src/Controller.kt" },
      { name: "IVehicle.aidl", webkitRelativePath: "demo/client/src/IVehicle.aidl" },
      { name: "AndroidManifest.xml", webkitRelativePath: "demo/app/src/AndroidManifest.xml" },
      { name: "libcar.so", webkitRelativePath: "demo/local_service/src/main/jniLibs/libcar.so" },
      { name: "cache.bin", webkitRelativePath: "demo/.gradle/cache.bin" },
    ] as File[];
    const result = filterSourceFiles(files);
    expect(result.included.map((file) => file.name)).toEqual(["Controller.kt", "IVehicle.aidl", "AndroidManifest.xml"]);
    expect(result.excluded).toHaveLength(2);
  });
});
