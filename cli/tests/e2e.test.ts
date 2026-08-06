import { describe, it, expect, afterAll } from "vitest";
import { scaffoldProject } from "../src/commands/scaffold.js";
import { execFile, type ChildProcess } from "child_process";
import { resolve } from "path";
import { readFileSync, existsSync, rmSync } from "fs";
import { randomUUID } from "crypto";

const FIXTURE = resolve(import.meta.dirname, "../../schema/__tests__/fixtures/valid-analysis.json");
const FRAMEWORK_DIR = resolve(import.meta.dirname, "../../framework");
const TMP_ROOT = resolve(import.meta.dirname, "../_e2e_tmp");

function tmpDir(): string {
  return resolve(TMP_ROOT, `e2e-${randomUUID().slice(0, 8)}`);
}

function commandFile(cmd: string): string {
  return process.platform === "win32" && (cmd === "npm" || cmd === "npx") ? (process.env.ComSpec ?? "cmd.exe") : cmd;
}

function commandArgs(cmd: string, args: string[]): string[] {
  return process.platform === "win32" && (cmd === "npm" || cmd === "npx") ? ["/d", "/s", "/c", cmd, ...args] : args;
}

function runInDir(dir: string, cmd: string, args: string[], timeout = 60_000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    const child = execFile(commandFile(cmd), commandArgs(cmd, args), { cwd: dir, maxBuffer: 10 * 1024 * 1024, timeout }, (error, stdout, stderr) => {
      resolvePromise({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: error ? 1 : 0 });
    });
    // Allow cleanup
    child.ref?.unref?.();
  });
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows EPERM on open handles */ }
  }
});

describe("E2E: scaffold → build → test → verify", () => {
  const analysis = JSON.parse(readFileSync(FIXTURE, "utf-8"));
  const outDir = tmpDir();

  it("scaffold generates all expected files", () => {
    scaffoldProject(analysis, outDir, FRAMEWORK_DIR);

    const requiredFiles = [
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "conf/config.yaml",
      "src/index.ts",
      "src/config.ts",
      "src/server.ts",
      "src/adapters/index.ts",
      "src/types/enums.ts",
      "src/types/errors.ts",
      "src/tools/registry.ts",
      "src/tools/schema.ts",
      "src/rpc/rpc-types.ts",
      "src/rpc/rpc-engine.ts",
      "src/rpc/rpc-client.ts",
      "src/executors/adb-executor.ts",
      "car-side/RpcEngine.ts",
      "car-side/manifest-page.json",
      "tests/contract/registry.test.ts",
    ];

    for (const f of requiredFiles) {
      expect(existsSync(resolve(outDir, f)), `Missing: ${f}`).toBe(true);
    }
  });

  it("package.json has framework as file: dependency", () => {
    const pkg = JSON.parse(readFileSync(resolve(outDir, "package.json"), "utf-8"));
    expect(pkg.dependencies["@im/mcp-server-framework"]).toMatch(/^file:/);
  });

  it("config.yaml has no environment variables", () => {
    const config = readFileSync(resolve(outDir, "conf/config.yaml"), "utf-8");
    expect(config).not.toContain("process.env");
    expect(config).toContain("mock_mode");
  });

  it("npm install succeeds", { timeout: 120_000 }, async () => {
    const result = await runInDir(outDir, "npm", ["install", "--prefer-offline", "--no-audit", "--no-fund", "--ignore-scripts"], 120_000);
    expect(result.exitCode, `npm install failed: ${result.stderr}`).toBe(0);
  });

  it("tsc --noEmit passes with zero errors", { timeout: 30_000 }, async () => {
    const result = await runInDir(outDir, "npx", ["tsc", "--noEmit"]);
    expect(result.exitCode, `TypeScript errors:\n${result.stderr}`).toBe(0);
  });

  it("vitest passes all generated tests", { timeout: 30_000 }, async () => {
    const result = await runInDir(outDir, "npx", ["vitest", "run"]);
    expect(result.exitCode, `Tests failed:\n${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("passed");
  });

  it("tsc build produces dist/index.js", { timeout: 30_000 }, async () => {
    const result = await runInDir(outDir, "npx", ["tsc"]);
    expect(result.exitCode, `Build failed:\n${result.stderr}`).toBe(0);
    expect(existsSync(resolve(outDir, "dist", "index.js"))).toBe(true);
  });

  it("server starts on stdio and logs connection", { timeout: 30_000 }, async () => {
    const distPath = resolve(outDir, "dist", "index.js");
    expect(existsSync(distPath)).toBe(true);

    const result = await new Promise<{ stderr: string }>((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error("Server startup timed out (10s)"));
      }, 10_000);

      const child: ChildProcess = execFile("node", [distPath], {
        cwd: outDir,
        maxBuffer: 1024 * 1024,
      }, (_error, _stdout, stderr) => {
        clearTimeout(timeout);
        resolvePromise({ stderr: stderr ?? "" });
      });

      // Close stdin to trigger server shutdown via transport close
      setTimeout(() => child.stdin?.end(), 1000);
    });

    expect(result.stderr).toContain("[mcp-server]");
  });
});
