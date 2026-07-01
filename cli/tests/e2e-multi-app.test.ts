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

function commandFile(cmd: string): string {
  return process.platform === "win32" && (cmd === "npm" || cmd === "npx") ? (process.env.ComSpec ?? "cmd.exe") : cmd;
}

function commandArgs(cmd: string, args: string[]): string[] {
  return process.platform === "win32" && (cmd === "npm" || cmd === "npx") ? ["/d", "/s", "/c", cmd, ...args] : args;
}

function runInDir(dir: string, cmd: string, args: string[], timeout = 60_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    execFile(commandFile(cmd), commandArgs(cmd, args), { cwd: dir, maxBuffer: 10 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolvePromise({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: error ? 1 : 0 });
    });
  });
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows EPERM */ }
  }
}, 60_000);

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
      "src/index.ts", "src/config.ts", "src/server.ts", "src/adapters/index.ts",
      "src/tools/registry.ts", "src/tools/schema.ts", "tests/contract/registry.test.ts",
      "src/rpc/rpc-types.ts", "src/rpc/rpc-engine.ts", "src/rpc/rpc-client.ts",
      "src/executors/adb-executor.ts", "car-side/RpcEngine.ts", "car-side/manifest-page.json"]) {
      expect(existsSync(resolve(outDir, f)), `Missing: ${f}`).toBe(true);
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

  it("tool schema contains every capability as one upstream tool", () => {
    const schema = readFileSync(resolve(outDir, "src/tools/schema.ts"), "utf-8");
    for (const cap of analysis.capabilities) {
      expect(schema, `Missing tool ${cap.id} in TOOL_SCHEMA`).toContain(`"name": "${cap.id}"`);
    }
  });
});
