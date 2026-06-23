import { describe, it, expect } from "vitest";
import { generateEnums } from "../src/generators/enums.js";
import { generateErrors } from "../src/generators/errors.js";
import { generateRegistry } from "../src/generators/registry.js";
import { generateContractTests } from "../src/generators/contract-tests.js";
import { generateMockAdapterTests } from "../src/generators/mock-adapter-tests.js";

const SAMPLE_ANALYSIS = {
  app: { name: "aipet", domain: "cockpit", framework: "YunOS HDT" as const, entryFile: "src/index.ts" },
  capabilities: [
    {
      id: "navigate_to",
      domain: "navigation",
      object: "page",
      action: "navigate_to",
      params: [{ name: "pageName", type: "string" }],
      returns: { type: "NavigationResult", fields: ["success", "currentPage"] },
      safetyLevel: "normal",
      sdkCalls: ["@system.router"],
      sourceRef: "src/services/router.ts:navigateTo",
    },
    {
      id: "capture_pet",
      domain: "pet",
      object: "pet",
      action: "capture",
      params: [{ name: "fps", type: "number" }],
      returns: { type: "CaptureResult", fields: ["success", "imagePath"] },
      safetyLevel: "p_gear_required",
      sdkCalls: ["@system.camera"],
      sourceRef: "src/services/pet.ts:capture",
    },
    {
      id: "read_gear_status",
      domain: "vehicle",
      object: "gear",
      action: "read_status",
      params: [],
      returns: { type: "GearStatus", fields: ["isParked", "ignoreMode", "rawValue"] },
      safetyLevel: "readonly",
      sdkCalls: ["@system.vehicle"],
      sourceRef: "src/services/vehicle.ts:readGearStatus",
    },
  ],
  enums: {
    GearPosition: { values: ["P", "R", "N", "D"], type: "string", sourceFile: "src/types/vehicle.ts" },
    FpsRange: { values: ["LOW", "MEDIUM", "HIGH"], type: "number", sourceFile: "src/types/pet.ts" },
  },
  errorCodes: {
    nav: { prefix: 2, domainName: "navigation", codes: { PAGE_NOT_FOUND: { value: 1, message: "页面不存在" } } },
    pet: { prefix: 3, domainName: "pet", codes: { CAPTURE_FAILED: { value: 1, message: "拍照失败" } } },
  },
};

describe("generateEnums", () => {
  it("generates TypeScript enum declarations", () => {
    const code = generateEnums(SAMPLE_ANALYSIS);
    expect(code).toContain("export const GearPosition");
    expect(code).toContain('P: "P"');
    expect(code).toContain('D: "D"');
    expect(code).toContain("as const");
    expect(code).toContain("export type GearPosition");
    expect(code).toContain("export const FpsRange");
  });

  it("handles empty enums", () => {
    const code = generateEnums({ ...SAMPLE_ANALYSIS, enums: {} });
    expect(code).toContain("// No enums defined");
  });
});

describe("generateErrors", () => {
  it("generates error code constants with domain prefixes", () => {
    const code = generateErrors(SAMPLE_ANALYSIS);
    expect(code).toContain("NAV_PAGE_NOT_FOUND");
    expect(code).toContain("2001");
    expect(code).toContain("PET_CAPTURE_FAILED");
    expect(code).toContain("3001");
  });

  it("generates error map with messages", () => {
    const code = generateErrors(SAMPLE_ANALYSIS);
    expect(code).toContain("页面不存在");
    expect(code).toContain("拍照失败");
  });

  it("handles empty error codes", () => {
    const code = generateErrors({ ...SAMPLE_ANALYSIS, errorCodes: {} });
    expect(code).toContain("// No error codes defined");
  });
});

describe("generateRegistry", () => {
  it("generates tool registry with all capabilities", () => {
    const code = generateRegistry(SAMPLE_ANALYSIS);
    expect(code).toContain("navigate_to");
    expect(code).toContain("capture_pet");
    expect(code).toContain("read_gear_status");
  });

  it("includes safety levels in registry entries", () => {
    const code = generateRegistry(SAMPLE_ANALYSIS);
    expect(code).toContain("normal");
    expect(code).toContain("p_gear_required");
    expect(code).toContain("readonly");
  });

  it("derives domain groupings", () => {
    const code = generateRegistry(SAMPLE_ANALYSIS);
    expect(code).toContain("navigation");
    expect(code).toContain("pet");
    expect(code).toContain("vehicle");
  });
});

describe("generateContractTests", () => {
  it("generates contract test for each capability", () => {
    const code = generateContractTests(SAMPLE_ANALYSIS);
    expect(code).toContain("navigate_to");
    expect(code).toContain("capture_pet");
    expect(code).toContain("read_gear_status");
  });

  it("imports TOOL_REGISTRY and asserts against it", () => {
    const code = generateContractTests(SAMPLE_ANALYSIS);
    expect(code).toContain('import { TOOL_REGISTRY,');
    expect(code).toContain("TOOL_REGISTRY.find");
  });

  it("validates tool count matches analysis", () => {
    const code = generateContractTests(SAMPLE_ANALYSIS);
    expect(code).toContain("toHaveLength(3)");
  });

  it("includes safety level assertions", () => {
    const code = generateContractTests(SAMPLE_ANALYSIS);
    expect(code).toContain("safetyLevel");
    expect(code).toContain("normal");
    expect(code).toContain("p_gear_required");
  });

  it("checks unique tool IDs", () => {
    const code = generateContractTests(SAMPLE_ANALYSIS);
    expect(code).toContain("new Set(ids).size");
  });
});

describe("generateMockAdapterTests", () => {
  it("generates test for every adapter method derived from capabilities", () => {
    const code = generateMockAdapterTests(SAMPLE_ANALYSIS);
    expect(code).toContain("navigateToPage");
    expect(code).toContain("capturePet");
    expect(code).toContain("readGearStatus");
  });

  it("includes error injection tests", () => {
    const code = generateMockAdapterTests(SAMPLE_ANALYSIS);
    expect(code).toContain("setError");
  });

  it("includes state reset tests", () => {
    const code = generateMockAdapterTests(SAMPLE_ANALYSIS);
    expect(code).toContain("resetState");
  });
});
