import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAnalysis } from "../src/commands/validate.js";
import { buildToolDefs } from "../src/generators/tool-schema.js";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

const FIXTURES_DIR = join(import.meta.dirname, "__fixtures__");
const SCHEMA_PATH = join(import.meta.dirname, "../../schema/analysis.schema.json");

const VALID_ANALYSIS = {
  app: {
    name: "test-app",
    domain: "cockpit",
    framework: "YunOS HDT",
    entryFile: "src/index.ts",
  },
  capabilities: [
    {
      id: "read_status",
      domain: "vehicle",
      object: "gear",
      action: "read_status",
      description: "Read the current gear status (P/R/N/D).",
      safetyLevel: "readonly",
      sdkCalls: ["@system.vehicle"],
      sourceRef: "src/services/vehicle.ts:readGearStatus",
    },
  ],
};

describe("validateAnalysis", () => {
  it("returns valid for a well-formed analysis.json", () => {
    const result = validateAnalysis(VALID_ANALYSIS);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("returns invalid when app is missing", () => {
    const result = validateAnalysis({ capabilities: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns invalid when capabilities is missing", () => {
    const result = validateAnalysis({
      app: { name: "x", domain: "y", framework: "YunOS HDT", entryFile: "a.ts" },
    });
    expect(result.valid).toBe(false);
  });

  it("returns invalid for unknown safetyLevel", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [
        {
          ...VALID_ANALYSIS.capabilities[0],
          safetyLevel: "dangerous",
        },
      ],
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(false);
  });

  it("returns invalid for empty capability id", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [
        {
          ...VALID_ANALYSIS.capabilities[0],
          id: "",
        },
      ],
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(false);
  });

  it("returns invalid for non-snake_case capability id", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [
        {
          ...VALID_ANALYSIS.capabilities[0],
          id: "BadName",
        },
      ],
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(false);
  });

  it("returns invalid for unsupported framework", () => {
    const input = {
      ...VALID_ANALYSIS,
      app: { ...VALID_ANALYSIS.app, framework: "React Native" },
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(false);
  });

  it("accepts Android interface analysis", () => {
    const input = { ...VALID_ANALYSIS, app: { ...VALID_ANALYSIS.app, framework: "Android", entryFile: "app/src/main/AndroidManifest.xml" } };
    expect(validateAnalysis(input).valid).toBe(true);
  });

  it("returns invalid when required capability fields are missing", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [{ id: "test_only" }],
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects a capability missing its description (host-LLM tool descriptions are mandatory)", () => {
    // Explicit guard: the schema marks `description` as required. If someone later
    // relaxes that, the "≥4 errors" test above would NOT catch the regression
    // (the other missing fields keep the count ≥4), so this must assert it directly.
    const { description: _desc, ...withoutDescription } = VALID_ANALYSIS.capabilities[0];
    void _desc;
    const result = validateAnalysis({
      ...VALID_ANALYSIS,
      capabilities: [withoutDescription],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /description/i.test(e.message))).toBe(true);
  });

  it("rejects duplicate capability ids because they collide as MCP tool names", () => {
    const result = validateAnalysis({
      ...VALID_ANALYSIS,
      capabilities: [
        VALID_ANALYSIS.capabilities[0],
        { ...VALID_ANALYSIS.capabilities[0], object: "speed", sourceRef: "src/services/vehicle.ts:readSpeed" },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("/capabilities/1/id") && e.message.includes("duplicate"))).toBe(true);
  });

  it("rejects duplicate parameter names within one capability", () => {
    const result = validateAnalysis({
      ...VALID_ANALYSIS,
      capabilities: [
        {
          ...VALID_ANALYSIS.capabilities[0],
          params: [
            { name: "zone", type: "string" },
            { name: "zone", type: "number" },
          ],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("/capabilities/0/params/1/name") && e.message.includes("duplicate"))).toBe(true);
  });

  it("rejects non-numeric enum values on number parameters", () => {
    const result = validateAnalysis({
      ...VALID_ANALYSIS,
      capabilities: [
        {
          ...VALID_ANALYSIS.capabilities[0],
          params: [{ name: "level", type: "number", enum: ["low", "high"] }],
        },
      ],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path.includes("/capabilities/0/params/0/enum") && e.message.includes("number"))).toBe(true);
  });

  it("accepts valid enums section", () => {
    const input = {
      ...VALID_ANALYSIS,
      enums: {
        GearPosition: {
          values: ["P", "R", "N", "D"],
          type: "string",
          sourceFile: "src/types/vehicle.ts",
        },
      },
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(true);
  });

  it("accepts valid errorCodes section", () => {
    const input = {
      ...VALID_ANALYSIS,
      errorCodes: {
        nav: {
          prefix: 2,
          domainName: "navigation",
          codes: {
            PAGE_NOT_FOUND: { value: 1, message: "页面不存在" },
          },
        },
      },
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(true);
  });

  it("rejects errorCodes with invalid prefix range", () => {
    const input = {
      ...VALID_ANALYSIS,
      errorCodes: {
        nav: {
          prefix: 0,
          domainName: "navigation",
          codes: {
            PAGE_NOT_FOUND: { value: 1, message: "页面不存在" },
          },
        },
      },
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(false);
  });

  it("validates the fixture file against schema", () => {
    const fixturePath = join(import.meta.dirname, "../../schema/__tests__/fixtures/valid-analysis.json");
    const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));
    const result = validateAnalysis(fixture);
    expect(result.valid).toBe(true);
  });
});

describe("buildToolDefs", () => {
  it("injects required confirmation input for p_gear_and_confirm tools", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [
        {
          ...VALID_ANALYSIS.capabilities[0],
          id: "set_drive_mode",
          action: "set_drive_mode",
          safetyLevel: "p_gear_and_confirm",
          params: [{ name: "mode", type: "string" }],
        },
      ],
    });

    expect(tool.inputSchema).toMatchObject({
      type: "object",
      properties: {
        mode: { type: "string" },
        confirmed: { type: "boolean" },
      },
      required: ["mode", "confirmed"],
    });
  });

  it("projects numeric enum values as number schema enums", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [
        {
          ...VALID_ANALYSIS.capabilities[0],
          params: [{ name: "level", type: "number", enum: ["18", "24"] }],
        },
      ],
    });

    expect(tool.inputSchema).toMatchObject({
      properties: {
        level: { type: "number", enum: [18, 24] },
      },
    });
  });

  it("fails closed when duplicate capability ids bypass validateAnalysis", () => {
    expect(() =>
      buildToolDefs({
        ...VALID_ANALYSIS,
        capabilities: [
          VALID_ANALYSIS.capabilities[0],
          { ...VALID_ANALYSIS.capabilities[0], object: "speed", sourceRef: "src/services/vehicle.ts:readSpeed" },
        ],
      }),
    ).toThrow(/duplicate/i);
  });

  it("projects string[] params as array schemas (not opaque objects)", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], params: [{ name: "effectId", type: "string[]" }] }],
    });
    expect(tool.inputSchema).toMatchObject({ properties: { effectId: { type: "array", items: { type: "string" } } } });
  });

  it("projects Array<T> params as array of object", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], params: [{ name: "items", type: "Array<{resourceCode:string}>" }] }],
    });
    expect(tool.inputSchema).toMatchObject({ properties: { items: { type: "array", items: { type: "object" } } } });
  });

  it("projects examples/minimum/maximum/defaultValue onto number params", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], params: [{ name: "level", type: "number", minimum: 0, maximum: 100, defaultValue: 50, examples: ["0", "100"] }] }],
    });
    expect(tool.inputSchema).toMatchObject({ properties: { level: { type: "number", minimum: 0, maximum: 100, default: 50, examples: ["0", "100"] } } });
  });

  it("projects returns → outputSchema with typed fields", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], returns: { type: "GearStatus", fields: [{ name: "gear", type: "string" }, { name: "isParked", type: "boolean" }] } }],
    });
    expect(tool.outputSchema).toMatchObject({ type: "object", properties: { gear: { type: "string" }, isParked: { type: "boolean" } } });
  });

  it("wraps outputSchema in array when returns.type is array-suffixed", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], returns: { type: "Item[]", fields: [{ name: "id", type: "string" }] } }],
    });
    expect(tool.outputSchema).toMatchObject({ type: "array", items: { type: "object", properties: { id: { type: "string" } } } });
  });

  it("scalar returns ignore authoring-noise fields (boolean stays boolean)", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], returns: { type: "boolean", fields: ["success"] } }],
    });
    expect(tool.outputSchema).toEqual({ type: "boolean" });
  });

  it("omits outputSchema when returns is absent", () => {
    const [tool] = buildToolDefs({ ...VALID_ANALYSIS, capabilities: [{ ...VALID_ANALYSIS.capabilities[0] }] });
    expect(tool.outputSchema).toBeUndefined();
  });

  // object / array / nested shapes — the recursive projector must emit STRUCTURED JSON-Schema
  // (object properties + required, array items, nesting, outputSchema) so downstream agents can
  // construct complex params and chain outputs. Generic fixtures, not app-specific.

  it("projects object params (properties) as structured object schemas with required", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{
        ...VALID_ANALYSIS.capabilities[0],
        params: [{
          name: "mode",
          type: "HvacMode",
          properties: [
            { name: "fanSpeed", type: "number", minimum: 0, maximum: 10 },
            { name: "zone", type: "string", enum: ["front", "rear"], optional: true },
          ],
        }],
      }],
    });
    expect(tool.inputSchema).toMatchObject({
      properties: {
        mode: {
          type: "object",
          additionalProperties: false,
          properties: {
            fanSpeed: { type: "number", minimum: 0, maximum: 10 },
            zone: { type: "string", enum: ["front", "rear"] },
          },
          required: ["fanSpeed"],
        },
      },
    });
  });

  it("projects array-of-object params (items with properties) as structured arrays", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{
        ...VALID_ANALYSIS.capabilities[0],
        params: [{
          name: "resources",
          type: "ResourceCode[]",
          items: {
            type: "object",
            properties: [
              { name: "resourceCode", type: "string" },
              { name: "quantity", type: "number", optional: true },
            ],
          },
        }],
      }],
    });
    expect(tool.inputSchema).toMatchObject({
      properties: {
        resources: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { resourceCode: { type: "string" }, quantity: { type: "number" } },
            required: ["resourceCode"],
          },
        },
      },
    });
  });

  it("projects deeply nested object params (property is itself an array of objects)", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{
        ...VALID_ANALYSIS.capabilities[0],
        params: [{
          name: "scene",
          type: "SceneConfig",
          properties: [{
            name: "lights",
            type: "LightCmd[]",
            items: {
              type: "object",
              properties: [
                { name: "id", type: "string" },
                { name: "brightness", type: "number", minimum: 0, maximum: 100 },
              ],
            },
          }],
        }],
      }],
    });
    expect(tool.inputSchema).toMatchObject({
      properties: {
        scene: {
          type: "object",
          required: ["lights"],
          properties: {
            lights: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string" },
                  brightness: { type: "number", minimum: 0, maximum: 100 },
                },
                required: ["id", "brightness"],
              },
            },
          },
        },
      },
    });
  });

  it("projects enum on array-element items", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{
        ...VALID_ANALYSIS.capabilities[0],
        params: [{ name: "gears", type: "string[]", items: { type: "string", enum: ["P", "R", "N", "D"] } }],
      }],
    });
    expect(tool.inputSchema).toMatchObject({
      properties: { gears: { type: "array", items: { type: "string", enum: ["P", "R", "N", "D"] } } },
    });
  });

  it("projects array-of-object return fields → outputSchema enabling tool chaining", () => {
    const [tool] = buildToolDefs({
      ...VALID_ANALYSIS,
      capabilities: [{
        ...VALID_ANALYSIS.capabilities[0],
        returns: {
          type: "SoundLib",
          fields: [{
            name: "entries",
            type: "SoundEntry[]",
            items: {
              type: "object",
              properties: [{ name: "resourceCode", type: "string" }, { name: "duration", type: "number" }],
            },
          }],
        },
      }],
    });
    // A downstream agent reads result.entries[].resourceCode and feeds it to install_*.
    expect(tool.outputSchema).toMatchObject({
      type: "object",
      properties: {
        entries: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: { resourceCode: { type: "string" }, duration: { type: "number" } },
            required: ["resourceCode", "duration"],
          },
        },
      },
    });
  });
});

describe("validateAnalysis semantic extensions (bounds + enum-grounding)", () => {
  const base = (overrides: Record<string, unknown>) => ({
    ...VALID_ANALYSIS,
    capabilities: [{ ...VALID_ANALYSIS.capabilities[0], ...overrides }],
  });

  it("rejects minimum > maximum on number params", () => {
    const r = validateAnalysis(base({ params: [{ name: "level", type: "number", minimum: 50, maximum: 10 }] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e: { message: string }) => /minimum cannot exceed maximum/.test(e.message))).toBe(true);
  });

  it("rejects non-array examples (schema-level enforcement)", () => {
    const r = validateAnalysis(base({ params: [{ name: "x", type: "string", examples: "nope" }] }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e: { path: string }) => /examples/.test(e.path))).toBe(true);
  });

  it("enum-grounds param.enum against enums[type].map (rejects hallucinated values)", () => {
    const r = validateAnalysis({
      ...VALID_ANALYSIS,
      enums: { Gear: { values: ["P", "R", "N", "D"], type: "string", map: { P: "Park", R: "Reverse", N: "Neutral", D: "Drive" } } },
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], params: [{ name: "gear", type: "Gear", enum: ["P", "X"] }] }],
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e: { message: string }) => /not in enums.Gear.map/.test(e.message))).toBe(true);
  });

  it("enum-grounding passes when all enum values are canonical", () => {
    const r = validateAnalysis({
      ...VALID_ANALYSIS,
      enums: { Gear: { values: ["P", "R", "N", "D"], type: "string", map: { P: "Park", R: "Reverse", N: "Neutral", D: "Drive" } } },
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], params: [{ name: "gear", type: "Gear", enum: ["P", "D"] }] }],
    });
    expect(r.valid).toBe(true);
  });
});
