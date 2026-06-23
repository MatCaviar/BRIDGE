import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAnalysis } from "../src/commands/validate.js";
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

  it("returns invalid when required capability fields are missing", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [{ id: "test_only" }],
    };
    const result = validateAnalysis(input);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
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
