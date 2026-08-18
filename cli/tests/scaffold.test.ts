import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import { scaffoldProject, scaffoldCommand } from "../src/commands/scaffold.js";

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
      "src/tools/schema.ts",
      "tests/contract/registry.test.ts",
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

  it("with selection.json, scaffold generates only selected capabilities", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    const selPath = resolve(OUTPUT_DIR, "selection.json");
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const ids = analysis.capabilities.map((c:any)=>c.id);
    writeFileSync(selPath, JSON.stringify({ selected: [ids[0]] }));
    scaffoldProject(analysis, OUTPUT_DIR, undefined, { selectionPath: selPath });
    const registry = readFileSync(resolve(OUTPUT_DIR, "src/tools/registry.ts"), "utf-8");
    expect(registry).toContain(ids[0]);
    for (const id of ids.slice(1)) expect(registry).not.toContain(id);
  });
  it("generate-layer overwritten on re-scaffold; conf/config.yaml (mock_mode) preserved", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);
    const yamlPath = resolve(OUTPUT_DIR, "conf/config.yaml");
    writeFileSync(yamlPath, readFileSync(yamlPath,"utf-8").replace("mock_mode: true","mock_mode: false"));
    writeFileSync(resolve(OUTPUT_DIR,"src/tools/registry.ts"), "// USER EDIT\n");
    scaffoldProject(analysis, OUTPUT_DIR);
    expect(readFileSync(yamlPath,"utf-8")).toContain("mock_mode: false");
    expect(readFileSync(resolve(OUTPUT_DIR,"src/tools/registry.ts"),"utf-8")).not.toContain("USER EDIT");
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
  it("adapter factory exposes schema-first rpcCall dispatch (no legacy adapter / no throw-stub)", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);
    const indexTs = readFileSync(resolve(OUTPUT_DIR, "src/adapters/index.ts"), "utf-8");
    // Dynamic server: every tool dispatches through one rpcCall(op, args).
    expect(indexTs).toContain("rpcCall");
    expect(indexTs).not.toContain("createYunosAdapter");
    expect(indexTs).not.toContain("throw new Error");
    expect(indexTs).not.toContain("not yet generated");
  });
  it("no longer emits the stale pre-SP-B AGENT_GUIDE.md", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);
    expect(existsSync(resolve(OUTPUT_DIR, "AGENT_GUIDE.md"))).toBe(false);
  });

  it("throws when selectionPath is provided but the file is missing", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    expect(() => scaffoldProject(analysis, OUTPUT_DIR, undefined, { selectionPath: resolve(OUTPUT_DIR, "does-not-exist.json") })).toThrow(/selection\.json/);
  });

  it("throws when selection.json lists unknown capability ids", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const selPath = resolve(OUTPUT_DIR, "selection.json");
    writeFileSync(selPath, JSON.stringify({ selected: ["does_not_exist"] }));
    expect(() => scaffoldProject(analysis, OUTPUT_DIR, undefined, { selectionPath: selPath })).toThrow(/unknown capability/);
  });
  it("throws when selection.json has an empty selected list", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const selPath = resolve(OUTPUT_DIR, "selection.json");
    writeFileSync(selPath, JSON.stringify({ selected: [] }));
    expect(() => scaffoldProject(analysis, OUTPUT_DIR, undefined, { selectionPath: selPath })).toThrow(/empty/);
  });

  it("scaffoldCommand --selection filters capabilities end-to-end", async () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    mkdirSync(OUTPUT_DIR, { recursive: true });
    const ids = analysis.capabilities.map((c:any)=>c.id);
    const selPath = resolve(OUTPUT_DIR, "selection.json");
    writeFileSync(selPath, JSON.stringify({ selected: [ids[0]] }));
    const out = resolve(OUTPUT_DIR, "proj");
    const cwd = process.cwd();
    try {
      process.chdir(OUTPUT_DIR);
      await scaffoldCommand([FIXTURE_PATH, "--output", out, "--selection", selPath]);
    } finally {
      process.chdir(cwd);
    }
    const registry = readFileSync(resolve(out, "src/tools/registry.ts"), "utf-8");
    expect(registry).toContain(ids[0]);
    for (const id of ids.slice(1)) expect(registry).not.toContain(id);
  });
});
