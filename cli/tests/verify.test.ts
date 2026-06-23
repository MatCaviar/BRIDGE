import { describe, it, expect, afterAll } from "vitest";
import { verifyCommand, runInstallAndTypecheck, assertRpcBridgeReady } from "../src/commands/verify.js";
import { scaffoldProject } from "../src/commands/scaffold.js";
import { resolve } from "path";
import { readFileSync, existsSync, rmSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

const FIXTURE = resolve(import.meta.dirname, "../../schema/__tests__/fixtures/valid-analysis.json");
const FRAMEWORK_DIR = resolve(import.meta.dirname, "../../framework");
const TMP_ROOT = resolve(import.meta.dirname, "../_verify_tmp");

function tmpDir(): string {
  return resolve(TMP_ROOT, `verify-${randomUUID().slice(0, 8)}`);
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows EPERM on open handles */ }
  }
});

describe("SP-D verify: new isolated checks", () => {
  const analysis = JSON.parse(readFileSync(FIXTURE, "utf-8"));
  const projectDir = tmpDir();

  it("scaffolds a sample server with rpc bridge", () => {
    scaffoldProject(analysis, projectDir, FRAMEWORK_DIR);
    expect(existsSync(resolve(projectDir, "src/adapters/yunos-adapter.ts"))).toBe(true);
    expect(existsSync(resolve(projectDir, "src/rpc/rpc-client.ts"))).toBe(true);
    expect(existsSync(resolve(projectDir, "src/rpc/rpc-engine.ts"))).toBe(true);
  });

  it("assertRpcBridgeReady passes on the generated project", () => {
    const errors = assertRpcBridgeReady(projectDir);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  it("runInstallAndTypecheck passes with zero errors after npm install + tsc", { timeout: 180_000 }, async () => {
    const errors = await runInstallAndTypecheck(projectDir);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  it("assertRpcBridgeReady flags a missing RPC_URL", () => {
    const badDir = tmpDir();
    scaffoldProject(analysis, badDir, FRAMEWORK_DIR);
    // Corrupt rpc-client: remove RPC_URL line by writing a stub.
    writeFileSync(resolve(badDir, "src/rpc/rpc-client.ts"), "export async function rpcCall() {}\n");
    const errors = assertRpcBridgeReady(badDir);
    expect(errors.some((e) => e.includes("RPC_URL"))).toBe(true);
  });
});

describe("SP-D verify: full verifyCommand on scaffolded+built server", () => {
  const analysis = JSON.parse(readFileSync(FIXTURE, "utf-8"));
  const projectDir = tmpDir();

  it("scaffold", () => {
    scaffoldProject(analysis, projectDir, FRAMEWORK_DIR);
  });

  it("npm install (prereq for runInstallAndTypecheck + build)", { timeout: 180_000 }, async () => {
    const { execFile } = await import("child_process");
    await new Promise<void>((resolvePromise, reject) => {
      execFile("npm", ["install"], { cwd: projectDir, shell: true, maxBuffer: 10 * 1024 * 1024, timeout: 180_000 }, (error) => {
        if (error) reject(error); else resolvePromise();
      });
    });
  });

  it("tsc build produces dist", { timeout: 60_000 }, async () => {
    const { execFile } = await import("child_process");
    await new Promise<void>((resolvePromise, reject) => {
      execFile("npx", ["tsc"], { cwd: projectDir, shell: true, maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }, (error) => {
        if (error) reject(error); else resolvePromise();
      });
    });
    expect(existsSync(resolve(projectDir, "dist", "index.js"))).toBe(true);
  });

  it("verifyCommand completes with no errors and exercises all 3 new checks", { timeout: 120_000 }, async () => {
    let threw: unknown = null;
    try {
      await verifyCommand(["--dir", projectDir]);
    } catch (e) {
      threw = e;
    }
    expect(threw, `verify threw: ${threw instanceof Error ? threw.message : String(threw)}`).toBeNull();
  });
});
