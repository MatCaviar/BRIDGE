import { describe, it, expect } from "vitest";
import { generateAdapterTypes, toMethodName, toDtoName } from "../src/generators/adapter-types.js";
import { generateMockAdapter } from "../src/generators/mock-adapter.js";
import { generateMockAdapterTests } from "../src/generators/mock-adapter-tests.js";
import { generateRegistry } from "../src/generators/registry.js";
import { generateToolHandlers } from "../src/generators/tool-handlers.js";
import { generateEnums } from "../src/generators/enums.js";
import { generateErrors } from "../src/generators/errors.js";
import type { AnalysisData } from "../src/types.js";

const BASE_APP = {
  name: "edge-test",
  domain: "cockpit",
  framework: "YunOS HDT",
  entryFile: "src/index.ts",
};

function makeAnalysis(overrides: Partial<AnalysisData> = {}): AnalysisData {
  return {
    app: BASE_APP,
    capabilities: [],
    ...overrides,
  } as AnalysisData;
}

describe("toMethodName — naming collision detection", () => {
  it("read + speed and read + rpm produce different method names", () => {
    const readSpeed = toMethodName("read", "speed");
    const readRpm = toMethodName("read", "rpm");
    expect(readSpeed).not.toBe(readRpm);
    expect(readSpeed).toBe("readSpeed");
    expect(readRpm).toBe("readRpm");
  });

  it("set_front + light and set_rear + light produce different method names", () => {
    const setFront = toMethodName("set_front", "light");
    const setRear = toMethodName("set_rear", "light");
    expect(setFront).not.toBe(setRear);
    // Order: verb + objectParts + non-preposition-rest
    expect(setFront).toBe("setLightFront");
    expect(setRear).toBe("setLightRear");
  });

  it("navigate_to + page produces navigateToPage (preposition before object)", () => {
    expect(toMethodName("navigate_to", "page")).toBe("navigateToPage");
  });

  it("read_status + gear produces readGearStatus (status after object)", () => {
    expect(toMethodName("read_status", "gear")).toBe("readGearStatus");
  });

  it("handles single-word action and object", () => {
    expect(toMethodName("capture", "pet")).toBe("capturePet");
    expect(toMethodName("toggle", "ac")).toBe("toggleAc");
  });

  it("handles multi-word objects", () => {
    expect(toMethodName("set", "seat_position")).toBe("setSeatPosition");
  });

  it("handles long compound names", () => {
    expect(toMethodName("read_from", "climate_sensor")).toBe("readFromClimateSensor");
  });
});

describe("toDtoName", () => {
  it("converts snake_case id to PascalCase Result", () => {
    expect(toDtoName("set_temperature")).toBe("SetTemperatureResult");
    expect(toDtoName("read_gear_status")).toBe("ReadGearStatusResult");
  });

  it("handles single-word id", () => {
    expect(toDtoName("ping")).toBe("PingResult");
  });
});

describe("generateAdapterTypes — edge cases", () => {
  it("handles capability with no returns field", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "fire_and_forget",
        domain: "system",
        object: "event",
        action: "emit",
        params: [{ name: "name", type: "string" }],
        safetyLevel: "normal",
        sdkCalls: [],
        sourceRef: "src/system.ts:emit",
      }],
    });

    const code = generateAdapterTypes(analysis);
    expect(code).toContain("IAdapter");
    expect(code).toContain("emitEvent");
    // No DTO generated for void return
    expect(code).toContain("Promise<unknown>");
  });

  it("handles capability with returns but no fields", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "get_status",
        domain: "system",
        object: "status",
        action: "get",
        params: [],
        returns: { type: "StatusResult" },
        safetyLevel: "readonly",
        sdkCalls: [],
        sourceRef: "src/system.ts:getStatus",
      }],
    });

    const code = generateAdapterTypes(analysis);
    expect(code).toContain("GetStatusResult");
    expect(code).toContain("readonly success: boolean");
  });

  it("handles capability with optional params", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "set_temp",
        domain: "climate",
        object: "temperature",
        action: "set",
        params: [
          { name: "value", type: "number" },
          { name: "unit", type: "string", optional: true },
        ],
        returns: { type: "TempResult", fields: ["success"] },
        safetyLevel: "normal",
        sdkCalls: [],
        sourceRef: "src/climate.ts:setTemp",
      }],
    });

    const code = generateAdapterTypes(analysis);
    expect(code).toContain("unit?: string");
    expect(code).toContain("value: number");
  });

  it("handles empty capabilities", () => {
    const analysis = makeAnalysis({ capabilities: [] });
    const code = generateAdapterTypes(analysis);
    expect(code).toContain("IAdapter");
    expect(code).toContain("readonly isMock: boolean");
  });

  it("deduplicates DTO types for same id", () => {
    // Two capabilities cannot have the same id by schema, but test the generator
    const analysis = makeAnalysis({
      capabilities: [{
        id: "read_speed",
        domain: "vehicle",
        object: "speed",
        action: "read",
        params: [],
        returns: { type: "SpeedResult", fields: ["success", "value"] },
        safetyLevel: "readonly",
        sdkCalls: [],
        sourceRef: "src/v.ts:readSpeed",
      }],
    });

    const code = generateAdapterTypes(analysis);
    const count = (code.match(/ReadSpeedResult/g) ?? []).length;
    // Should appear in: interface declaration + IAdapter method return type
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThan(6); // Not duplicated excessively
  });
});

describe("generateMockAdapter — edge cases", () => {
  it("imports DTO types used in return values", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "get_data",
        domain: "test",
        object: "data",
        action: "get",
        params: [],
        returns: { type: "DataResult", fields: ["success", "payload"] },
        safetyLevel: "readonly",
        sdkCalls: [],
        sourceRef: "src/test.ts:getData",
      }],
    });

    const code = generateMockAdapter(analysis);
    expect(code).toContain("import type { IAdapter, GetDataResult }");
  });

  it("handles no-return capability without importing unknown types", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "do_something",
        domain: "test",
        object: "task",
        action: "do",
        params: [],
        safetyLevel: "normal",
        sdkCalls: [],
        sourceRef: "src/test.ts:do",
      }],
    });

    const code = generateMockAdapter(analysis);
    expect(code).toContain("import type { IAdapter }");
    expect(code).not.toContain(", } from"); // No trailing comma from empty DTO list
  });

  it("returns frozen objects to prevent mutation", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "get_info",
        domain: "test",
        object: "info",
        action: "get",
        params: [],
        returns: { type: "InfoResult", fields: ["success", "details"] },
        safetyLevel: "readonly",
        sdkCalls: [],
        sourceRef: "src/test.ts:getInfo",
      }],
    });

    const code = generateMockAdapter(analysis);
    expect(code).toContain("frozen<");
    expect(code).toContain("structuredClone");
  });
});

describe("generateMockAdapterTests — control separation", () => {
  it("always uses control for setError/resetState, adapter for methods", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "read_value",
        domain: "test",
        object: "value",
        action: "read",
        params: [],
        returns: { type: "ValueResult", fields: ["success"] },
        safetyLevel: "readonly",
        sdkCalls: [],
        sourceRef: "src/test.ts:readValue",
      }],
    });

    const code = generateMockAdapterTests(analysis);

    // setError and resetState must be on control, not adapter
    expect(code).toContain("control.setError");
    expect(code).toContain("control.resetState");
    expect(code).not.toContain("adapter.setError");
    expect(code).not.toContain("adapter.resetState");

    // Method calls on adapter
    expect(code).toContain("adapter.readValue");
  });

  it("destructures createMockAdapter into { adapter, control }", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "ping",
        domain: "system",
        object: "system",
        action: "ping",
        params: [],
        safetyLevel: "readonly",
        sdkCalls: [],
        sourceRef: "src/system.ts:ping",
      }],
    });

    const code = generateMockAdapterTests(analysis);
    expect(code).toContain("({ adapter, control } = createMockAdapter())");
  });
});

describe("generateToolHandlers — edge cases", () => {
  it("generates z.enum for enum params", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "set_mode",
        domain: "climate",
        object: "mode",
        action: "set",
        params: [{ name: "mode", type: "string", enum: ["auto", "manual", "off"] }],
        returns: { type: "ModeResult", fields: ["success"] },
        safetyLevel: "normal",
        sdkCalls: [],
        sourceRef: "src/climate.ts:setMode",
      }],
    });

    const files = generateToolHandlers(analysis);
    const climateFile = files.get("src/tools/climate.ts");
    expect(climateFile).toBeDefined();
    expect(climateFile).toContain('z.enum(["auto", "manual", "off"])');
  });

  it("generates z.boolean for boolean params", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "toggle_feature",
        domain: "system",
        object: "feature",
        action: "toggle",
        params: [{ name: "enabled", type: "boolean" }],
        returns: { type: "ToggleResult", fields: ["success"] },
        safetyLevel: "normal",
        sdkCalls: [],
        sourceRef: "src/system.ts:toggle",
      }],
    });

    const files = generateToolHandlers(analysis);
    const code = files.get("src/tools/system.ts")!;
    expect(code).toContain("z.boolean()");
  });

  it("generates empty schema for no-param capability", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "read_status",
        domain: "system",
        object: "status",
        action: "read",
        params: [],
        returns: { type: "StatusResult", fields: ["success"] },
        safetyLevel: "readonly",
        sdkCalls: [],
        sourceRef: "src/system.ts:readStatus",
      }],
    });

    const files = generateToolHandlers(analysis);
    const code = files.get("src/tools/system.ts")!;
    expect(code).toContain('"read_status"');
  });

  it("separates capabilities into per-domain files", () => {
    const analysis = makeAnalysis({
      capabilities: [
        {
          id: "read_temp",
          domain: "climate",
          object: "temp",
          action: "read",
          params: [],
          safetyLevel: "readonly",
          sdkCalls: [],
          sourceRef: "src/climate.ts:readTemp",
        },
        {
          id: "read_speed",
          domain: "vehicle",
          object: "speed",
          action: "read",
          params: [],
          safetyLevel: "readonly",
          sdkCalls: [],
          sourceRef: "src/vehicle.ts:readSpeed",
        },
      ],
    });

    const files = generateToolHandlers(analysis);
    expect(files.has("src/tools/climate.ts")).toBe(true);
    expect(files.has("src/tools/vehicle.ts")).toBe(true);
    expect(files.size).toBe(2);
  });

  it("handles 10+ capabilities across multiple domains", () => {
    const caps = [];
    for (let i = 0; i < 15; i++) {
      const domain = ["climate", "vehicle", "seat", "window", "light"][i % 5];
      caps.push({
        id: `action_${domain}_${i}`,
        domain,
        object: `obj_${i}`,
        action: "do",
        params: [{ name: "val", type: "number" }],
        returns: { type: `Result${i}`, fields: ["success"] },
        safetyLevel: "normal",
        sdkCalls: [],
        sourceRef: `src/${domain}.ts:do${i}`,
      });
    }

    const analysis = makeAnalysis({ capabilities: caps });
    const files = generateToolHandlers(analysis);

    expect(files.size).toBe(5); // 5 domains
    for (const [, code] of files) {
      expect(code).toContain("server.registerTool(");
    }
  });
});

describe("generateRegistry — safety level types", () => {
  it("inlines SafetyLevel type without external imports", () => {
    const analysis = makeAnalysis({
      capabilities: [{
        id: "test_action",
        domain: "test",
        object: "obj",
        action: "do",
        safetyLevel: "normal",
        sdkCalls: [],
        sourceRef: "src/test.ts:do",
      }],
    });

    const code = generateRegistry(analysis);
    expect(code).toContain("export type SafetyLevel");
    expect(code).toContain('"readonly"');
    expect(code).toContain('"p_gear_and_network"');
    // Must NOT import from external path
    expect(code).not.toContain("from \"./middleware");
  });
});

describe("generateEnums — edge cases", () => {
  it("generates comment for empty enums", () => {
    const code = generateEnums(makeAnalysis({ enums: {} }));
    expect(code).toContain("No enums");
  });

  it("generates number-type enums", () => {
    const code = generateEnums(makeAnalysis({
      enums: { Level: { values: ["LOW", "MID", "HIGH"], type: "number" } },
    }));
    expect(code).toContain("export const Level");
    expect(code).toContain("as const");
  });
});

describe("generateErrors — edge cases", () => {
  it("generates comment for empty error codes", () => {
    const code = generateErrors(makeAnalysis({ errorCodes: {} }));
    expect(code).toContain("No error codes");
  });

  it("prefixes codes correctly (prefix * 1000 + value)", () => {
    const code = generateErrors(makeAnalysis({
      errorCodes: {
        sys: { prefix: 7, domainName: "system", codes: {
          FOO: { value: 42, message: "bar" },
        }},
      },
    }));
    expect(code).toContain("7042");
  });
});
