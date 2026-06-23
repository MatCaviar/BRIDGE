import { describe, it, expect, afterAll } from "vitest";
import { scaffoldProject } from "../src/commands/scaffold.js";
import { execFile } from "child_process";
import { resolve } from "path";
import { readFileSync, existsSync, rmSync } from "fs";
import { randomUUID } from "crypto";

const FRAMEWORK_DIR = resolve(import.meta.dirname, "../../framework");
const FIXTURES_DIR = resolve(import.meta.dirname, "../../schema/__tests__/fixtures");
const TMP_ROOT = resolve(import.meta.dirname, "../_e2e_multi_tmp");

function tmpDir(name: string): string {
  return resolve(TMP_ROOT, `${name}-${randomUUID().slice(0, 8)}`);
}

function runInDir(dir: string, cmd: string, args: string[], timeout = 60_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    execFile(cmd, args, { cwd: dir, shell: true, maxBuffer: 10 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolvePromise({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: error ? 1 : 0 });
    });
  });
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }
});

type FixtureName = "hvac" | "minimal" | "collision";

const FIXTURES: FixtureName[] = ["hvac", "minimal", "collision"];

function loadFixture(name: FixtureName) {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, `${name}-analysis.json`), "utf-8"));
}

// Full pipeline per fixture — this catches generalization bugs
describe.each(FIXTURES)("E2E multi-app: %s", (fixtureName) => {
  const analysis = loadFixture(fixtureName);
  const outDir = tmpDir(fixtureName);
  const capCount = analysis.capabilities.length;
  const domains = [...new Set(analysis.capabilities.map((c: any) => c.domain))];

  it(`scaffold generates all files for ${capCount} capabilities across ${domains.length} domains`, () => {
    scaffoldProject(analysis, outDir, FRAMEWORK_DIR);

    // Core files must exist
    for (const f of ["package.json", "tsconfig.json", "vitest.config.ts", "conf/config.yaml",
      "src/index.ts", "src/config.ts", "src/server.ts", "src/shutdown.ts",
      "src/adapters/types.ts", "src/adapters/mock-adapter.ts", "src/adapters/index.ts",
      "src/tools/registry.ts", "tests/contract/registry.test.ts", "tests/unit/mock-adapter.test.ts"]) {
      expect(existsSync(resolve(outDir, f)), `Missing: ${f}`).toBe(true);
    }

    // Per-domain tool files must exist
    for (const d of domains) {
      expect(existsSync(resolve(outDir, `src/tools/${d}.ts`)), `Missing domain tool: ${d}.ts`).toBe(true);
    }

    // Enums and errors only if defined
    if (analysis.enums && Object.keys(analysis.enums).length > 0) {
      expect(existsSync(resolve(outDir, "src/types/enums.ts"))).toBe(true);
    }
    if (analysis.errorCodes && Object.keys(analysis.errorCodes).length > 0) {
      expect(existsSync(resolve(outDir, "src/types/errors.ts"))).toBe(true);
    }
  });

  it("npm install succeeds", { timeout: 120_000 }, async () => {
    const result = await runInDir(outDir, "npm", ["install"], 120_000);
    expect(result.exitCode, `npm install failed: ${result.stderr}`).toBe(0);
  });

  it("tsc --noEmit passes", { timeout: 30_000 }, async () => {
    const result = await runInDir(outDir, "npx", ["tsc", "--noEmit"]);
    expect(result.exitCode, `TypeScript errors for ${fixtureName}:\n${result.stderr}`).toBe(0);
  });

  it("generated tests pass", { timeout: 30_000 }, async () => {
    const result = await runInDir(outDir, "npx", ["vitest", "run"]);
    expect(result.exitCode, `Tests failed for ${fixtureName}:\n${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("tsc build produces dist/", { timeout: 30_000 }, async () => {
    const result = await runInDir(outDir, "npx", ["tsc"]);
    expect(result.exitCode, `Build failed for ${fixtureName}: ${result.stderr}`).toBe(0);
    expect(existsSync(resolve(outDir, "dist", "index.js"))).toBe(true);
  });

  it("generated contract test has correct capability count", () => {
    const contract = readFileSync(resolve(outDir, "tests/contract/registry.test.ts"), "utf-8");
    expect(contract).toContain(`toHaveLength(${capCount})`);
  });

  it("adapter interface has all methods", () => {
    const types = readFileSync(resolve(outDir, "src/adapters/types.ts"), "utf-8");
    expect(types).toContain("IAdapter");
    for (const cap of analysis.capabilities) {
      const words = cap.action.split("_");
      const verb = words[0].toLowerCase();
      const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
      const objectParts = cap.object.split("_").map(pascal);
      const rest = words.slice(1).map(pascal);
      const preps = new Set(["To", "From", "By", "With", "For", "Into", "Onto", "At"]);
      const before = rest.filter((w: string) => preps.has(w));
      const after = rest.filter((w: string) => !preps.has(w));
      const methodName = verb + [...before, ...objectParts, ...after].join("");
      expect(types, `Missing method ${methodName} in IAdapter`).toContain(methodName);
    }
  });
});
