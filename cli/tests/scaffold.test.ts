import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync } from "fs";
import { resolve } from "path";
import { scaffoldProject } from "../src/commands/scaffold.js";

const OUTPUT_DIR = resolve(import.meta.dirname, "__scaffold_output__");
const FIXTURE_PATH = resolve(import.meta.dirname, "../../schema/__tests__/fixtures/valid-analysis.json");

describe("scaffoldProject", () => {
  beforeEach(() => {
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true });
  });

  it("creates project directory with all required files", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);

    const requiredFiles = [
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "src/index.ts",
      "src/server.ts",
      "src/adapters/index.ts",
      "src/types/enums.ts",
      "src/types/errors.ts",
      "src/tools/registry.ts",
      "tests/contract/registry.test.ts",
      "tests/unit/mock-adapter.test.ts",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(resolve(OUTPUT_DIR, file)), `Missing file: ${file}`).toBe(true);
    }
  });

  it("generates package.json with correct app name", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);

    const pkg = JSON.parse(readFileSync(resolve(OUTPUT_DIR, "package.json"), "utf-8"));
    expect(pkg.name).toBe("@im/mcp-aipet");
    expect(pkg.dependencies).toBeDefined();
  });

  it("generates enums.ts with enum declarations", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);

    const enums = readFileSync(resolve(OUTPUT_DIR, "src/types/enums.ts"), "utf-8");
    expect(enums).toContain("export const GearPosition");
  });

  it("generates errors.ts with error code constants", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);

    const errors = readFileSync(resolve(OUTPUT_DIR, "src/types/errors.ts"), "utf-8");
    expect(errors).toContain("NAV_PAGE_NOT_FOUND");
  });

  it("generates registry.ts with tool entries", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);

    const registry = readFileSync(resolve(OUTPUT_DIR, "src/tools/registry.ts"), "utf-8");
    expect(registry).toContain("navigate_to");
    expect(registry).toContain("capture_pet");
  });

  it("does not overwrite existing files by default", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);

    const pkgPath = resolve(OUTPUT_DIR, "package.json");
    const original = readFileSync(pkgPath, "utf-8");

    // Second scaffold should not overwrite
    scaffoldProject(analysis, OUTPUT_DIR);
    const afterSecond = readFileSync(pkgPath, "utf-8");
    expect(afterSecond).toBe(original);
  });

  it("config.ts contains AdbConfig and config.yaml contains adb block", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);
    const configTs = readFileSync(resolve(OUTPUT_DIR, "src/config.ts"), "utf-8");
    expect(configTs).toContain("interface AdbConfig");
    expect(configTs).toContain("use_host");
    const configYaml = readFileSync(resolve(OUTPUT_DIR, "conf/config.yaml"), "utf-8");
    expect(configYaml).toContain("adb:");
    expect(configYaml).toContain("use_host: true");
  });

  it("scaffold emits rpc bridge + car-side deliverables", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);
    for (const f of ["src/rpc/rpc-types.ts", "src/rpc/rpc-engine.ts", "src/rpc/rpc-client.ts", "src/executors/adb-executor.ts", "car-side/RpcEngine.ts", "car-side/manifest-page.json"]) {
      expect(existsSync(resolve(OUTPUT_DIR, f)), `Missing: ${f}`).toBe(true);
    }
  });
});
