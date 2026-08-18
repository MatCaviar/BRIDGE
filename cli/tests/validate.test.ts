import { describe, it, expect } from "vitest";
import { validateAnalysis } from "../src/commands/validate.js";
import { readFileSync } from "fs";
import { join } from "path";

const SCHEMA_PATH = join(import.meta.dirname, "../../schema/analysis.schema.json");

const VALID_ANALYSIS = {
  app: { name: "test-app", framework: "android-kotlin" },
  capabilities: [
    {
      id: "set_mode",
      domain: "app_x",
      object: "mode",
      action: "set",
      description: "切换模式: 0=A 1=B。用户说'切换模式'时用。",
      safetyLevel: "normal",
      status: "verified",
      sourceRef: "Service.kt:setMode",
      mechanism: "execmd",
      methodName: "setMode",
      pattern: "scalar",
      servicePackage: "com.x.app",
      serviceClass: "com.x.app.Service",
      bindAction: "com.x.app.BIND",
      params: [
        { name: "mode", type: "int", optional: false, enum: ["0", "1"], description: "0=A 1=B" },
      ],
    },
  ],
};

describe("validateAnalysis (aligned to E2E serve spec)", () => {
  it("accepts a well-formed analysis with mechanism fields", () => {
    const r = validateAnalysis(VALID_ANALYSIS);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it("accepts apk-reverse / prd-only frameworks", () => {
    for (const fw of ["apk-reverse", "prd-only"]) {
      const r = validateAnalysis({ ...VALID_ANALYSIS, app: { name: "x", framework: fw } });
      expect(r.valid).toBe(true);
    }
  });

  it("rejects when app is missing", () => {
    expect(validateAnalysis({ capabilities: [] }).valid).toBe(false);
  });

  it("rejects when capabilities is missing", () => {
    expect(validateAnalysis({ app: { name: "x", framework: "android-kotlin" } }).valid).toBe(false);
  });

  it("rejects unknown safetyLevel", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], safetyLevel: "dangerous" }],
    };
    expect(validateAnalysis(input).valid).toBe(false);
  });

  it("rejects duplicate capability ids (MCP tool name collision)", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [VALID_ANALYSIS.capabilities[0], VALID_ANALYSIS.capabilities[0]],
    };
    expect(validateAnalysis(input).valid).toBe(false);
  });

  it("rejects duplicate parameter names within a capability", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [{
        ...VALID_ANALYSIS.capabilities[0],
        params: [
          { name: "mode", type: "int" },
          { name: "mode", type: "int" },
        ],
      }],
    };
    expect(validateAnalysis(input).valid).toBe(false);
  });

  it("rejects capability missing required fields", () => {
    const input = { ...VALID_ANALYSIS, capabilities: [{ id: "x" }] };
    expect(validateAnalysis(input).valid).toBe(false);
  });

  it("rejects capability missing description (LLM tool-selection signal)", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], description: undefined }],
    };
    const r = validateAnalysis(input);
    expect(r.valid).toBe(false);
  });

  it("rejects unknown mechanism", () => {
    const input = {
      ...VALID_ANALYSIS,
      capabilities: [{ ...VALID_ANALYSIS.capabilities[0], mechanism: "telepathy" }],
    };
    expect(validateAnalysis(input).valid).toBe(false);
  });

  it("validates the shipped bridge-analysis.json against schema", () => {
    const path = join(import.meta.dirname, "../../e2e/bridge-analysis.json");
    const data = JSON.parse(readFileSync(path, "utf-8"));
    const r = validateAnalysis(data);
    expect(r.valid).toBe(true);
  });
});
