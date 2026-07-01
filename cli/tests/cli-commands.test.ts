import { describe, it, expect, afterAll } from "vitest";
import { scaffoldProject } from "../src/commands/scaffold.js";
import { execFile } from "child_process";
import { resolve } from "path";
import { readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";

const FIXTURE = resolve(import.meta.dirname, "../../schema/__tests__/fixtures/valid-analysis.json");
const FRAMEWORK_DIR = resolve(import.meta.dirname, "../../framework");
const TMP_ROOT = resolve(import.meta.dirname, "../_cli_cmd_tmp");

function tmpDir(): string {
  return resolve(TMP_ROOT, `cli-${randomUUID().slice(0, 8)}`);
}

function commandFile(cmd: string): string {
  return process.platform === "win32" && (cmd === "npm" || cmd === "npx") ? (process.env.ComSpec ?? "cmd.exe") : cmd;
}

function commandArgs(cmd: string, args: string[]): string[] {
  return process.platform === "win32" && (cmd === "npm" || cmd === "npx") ? ["/d", "/s", "/c", cmd, ...args] : args;
}

function run(cmd: string, args: string[], opts?: { cwd?: string; timeout?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolvePromise) => {
    execFile(commandFile(cmd), commandArgs(cmd, args), { cwd: opts?.cwd, maxBuffer: 10 * 1024 * 1024, timeout: opts?.timeout ?? 60_000 }, (error, stdout, stderr) => {
      resolvePromise({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: error ? 1 : 0 });
    });
  });
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows */ }
  }
});

describe("CLI commands: build → test → verify", () => {
  const analysis = JSON.parse(readFileSync(FIXTURE, "utf-8"));
  const projectDir = tmpDir();

  it("scaffold and install", { timeout: 120_000 }, async () => {
    scaffoldProject(analysis, projectDir, FRAMEWORK_DIR);
    const result = await run("npm", ["install"], { cwd: projectDir, timeout: 120_000 });
    expect(result.exitCode, `npm install failed: ${result.stderr}`).toBe(0);
  });

  it("mcp-pipeline build compiles the project", { timeout: 60_000 }, async () => {
    const cliPath = resolve(import.meta.dirname, "../bin/mcp-pipeline.js");
    const result = await run("node", [cliPath, "build", projectDir], { timeout: 60_000 });
    expect(result.exitCode, `build failed: ${result.stderr}`).toBe(0);
    expect(existsSync(resolve(projectDir, "dist", "index.js"))).toBe(true);
    expect(result.stdout).toContain("Build succeeded");
  });

  it("mcp-pipeline test runs generated tests", { timeout: 60_000 }, async () => {
    const cliPath = resolve(import.meta.dirname, "../bin/mcp-pipeline.js");
    const result = await run("node", [cliPath, "test", projectDir], { timeout: 60_000 });
    expect(result.exitCode, `test failed: ${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("passed");

    // Verify test results file written
    const resultsPath = resolve(projectDir, "..", ".mcp-pipeline", "test-results.json");
    expect(existsSync(resultsPath)).toBe(true);
    const results = JSON.parse(readFileSync(resultsPath, "utf-8"));
    expect(results.passed).toBeGreaterThan(0);
    expect(results.failed).toBe(0);
  });

  it("mcp-pipeline verify discovers tools via MCP protocol", { timeout: 30_000 }, async () => {
    const cliPath = resolve(import.meta.dirname, "../bin/mcp-pipeline.js");
    const result = await run("node", [cliPath, "verify", "--dir", projectDir], { timeout: 30_000 });
    expect(result.exitCode, `verify failed: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Verified");
    expect(result.stdout).toContain("Tools:");
    // Must discover at least navigate_to, capture_pet, read_gear_status, health_check
    expect(result.stdout).toContain("navigate_to");
    expect(result.stdout).toContain("capture_pet");
    expect(result.stdout).toContain("read_gear_status");
    expect(result.stdout).toContain("health_check");
  });

  it("verify fails with clear error when dist/ missing", { timeout: 15_000 }, async () => {
    const emptyDir = tmpDir();
    mkdirSync(emptyDir, { recursive: true });
    writeFileSync(resolve(emptyDir, "package.json"), JSON.stringify({ name: "@im/mcp-test" }));

    const cliPath = resolve(import.meta.dirname, "../bin/mcp-pipeline.js");
    const result = await run("node", [cliPath, "verify", "--dir", emptyDir], { timeout: 15_000 });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("not found");
  });

  it("register appends to gateway config", { timeout: 15_000 }, async () => {
    const gatewayDir = tmpDir();
    mkdirSync(gatewayDir, { recursive: true });
    writeFileSync(resolve(gatewayDir, "config.yaml"), "mcp_servers:\n  - name: existing\n    command: node\n");

    const cliPath = resolve(import.meta.dirname, "../bin/mcp-pipeline.js");
    const result = await run("node", [cliPath, "register", "--dir", projectDir, "--gateway", gatewayDir], { timeout: 15_000 });
    expect(result.exitCode, `register failed: ${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("Registered");

    const updated = readFileSync(resolve(gatewayDir, "config.yaml"), "utf-8");
    expect(updated).toContain("@im/mcp-aipet");
    expect(updated).toContain("Auto-registered");
  });

  it("register is idempotent — second call reports already registered", { timeout: 15_000 }, async () => {
    const gatewayDir = tmpDir();
    mkdirSync(gatewayDir, { recursive: true });
    writeFileSync(resolve(gatewayDir, "config.yaml"), "mcp_servers:\n");

    const cliPath = resolve(import.meta.dirname, "../bin/mcp-pipeline.js");
    await run("node", [cliPath, "register", "--dir", projectDir, "--gateway", gatewayDir]);
    const second = await run("node", [cliPath, "register", "--dir", projectDir, "--gateway", gatewayDir]);

    expect(second.stdout).toContain("Already registered");
    // Config should not have duplicates
    const config = readFileSync(resolve(gatewayDir, "config.yaml"), "utf-8");
    const count = (config.match(/@im\/mcp-aipet/g) ?? []).length;
    expect(count).toBe(1);
  });
});
