import { describe, it, expect, afterAll } from "vitest";
import { verifyCommand, runInstallAndTypecheck, assertRpcBridgeReady, discoverTools } from "../src/commands/verify.js";
import { scaffoldProject } from "../src/commands/scaffold.js";
import { resolve } from "path";
import { mkdirSync, readFileSync, existsSync, rmSync, writeFileSync } from "fs";
import { randomUUID } from "crypto";

const FIXTURE = resolve(import.meta.dirname, "../../schema/__tests__/fixtures/valid-analysis.json");
const FRAMEWORK_DIR = resolve(import.meta.dirname, "../../framework");
const TMP_ROOT = resolve(import.meta.dirname, "../_verify_tmp");

function tmpDir(): string {
  return resolve(TMP_ROOT, `verify-${randomUUID().slice(0, 8)}`);
}

function commandFile(cmd: "npm" | "npx"): string {
  return process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : cmd;
}

function commandArgs(cmd: "npm" | "npx", args: string[]): string[] {
  return process.platform === "win32" ? ["/d", "/s", "/c", cmd, ...args] : args;
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows EPERM on open handles */ }
  }
}, 60_000);

describe("discoverTools", () => {
  it("does not treat JSON-RPC tools/call errors as successful responsiveness", { timeout: 10_000 }, async () => {
    const dir = tmpDir();
    mkdirSync(dir, { recursive: true });
    const serverPath = resolve(dir, "error-server.mjs");
    writeFileSync(serverPath, `
import { createInterface } from "node:readline";
process.stderr.write("[mcp-server] ready\\n");
const rl = createInterface({ input: process.stdin });
function send(payload) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...payload }) + "\\n"); }
rl.on("line", (line) => {
  const req = JSON.parse(line);
  if (req.method === "initialize") send({ id: req.id, result: { serverInfo: { name: "bad", version: "1.0" }, capabilities: {} } });
  if (req.method === "tools/list") send({ id: req.id, result: { tools: [{ name: "health_check", inputSchema: { type: "object", properties: {} } }] } });
  if (req.method === "tools/call") send({ id: req.id, error: { code: -32000, message: "boom" } });
});
`);

    const result = await discoverTools(serverPath);

    expect(result.tools).toEqual(["health_check"]);
    expect(result.callSucceeded).toBe(false);
    expect(result.callError).toContain("boom");
  });

  it("checks non-health tools instead of passing on health_check only", { timeout: 10_000 }, async () => {
    const dir = tmpDir();
    mkdirSync(dir, { recursive: true });
    const serverPath = resolve(dir, "bad-business-tool-server.mjs");
    writeFileSync(serverPath, `
import { createInterface } from "node:readline";
process.stderr.write("[mcp-server] ready\\n");
const rl = createInterface({ input: process.stdin });
function send(payload) { process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...payload }) + "\\n"); }
rl.on("line", (line) => {
  const req = JSON.parse(line);
  if (req.method === "initialize") send({ id: req.id, result: { serverInfo: { name: "bad", version: "1.0" }, capabilities: {} } });
  if (req.method === "tools/list") send({ id: req.id, result: { tools: [
    { name: "health_check", inputSchema: { type: "object", properties: {} } },
    { name: "set_mode", inputSchema: { type: "object", properties: { mode: { type: "string" } }, required: ["mode"] } }
  ] } });
  if (req.method === "tools/call" && req.params.name === "health_check") send({ id: req.id, result: { content: [{ type: "text", text: "{}" }] } });
  if (req.method === "tools/call" && req.params.name === "set_mode") send({ id: req.id, error: { code: -32000, message: "business tool failed" } });
});
`);

    const result = await discoverTools(serverPath);

    expect(result.tools).toEqual(["health_check", "set_mode"]);
    expect(result.callSucceeded).toBe(false);
    expect(result.callError).toContain("set_mode");
    expect(result.callError).toContain("business tool failed");
  });
});

describe("SP-D verify: new isolated checks", () => {
  const analysis = JSON.parse(readFileSync(FIXTURE, "utf-8"));
  const projectDir = tmpDir();

  it("scaffolds a sample server with rpc bridge", () => {
    scaffoldProject(analysis, projectDir, FRAMEWORK_DIR);
    expect(existsSync(resolve(projectDir, "src/adapters/index.ts"))).toBe(true);
    expect(existsSync(resolve(projectDir, "src/tools/schema.ts"))).toBe(true);
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

  it("assertRpcBridgeReady flags missing agent-facing schema export", () => {
    const badDir = tmpDir();
    scaffoldProject(analysis, badDir, FRAMEWORK_DIR);
    writeFileSync(resolve(badDir, "src/tools/schema.ts"), "export const OTHER = [];\n");
    const errors = assertRpcBridgeReady(badDir);
    expect(errors.some((e) => e.includes("TOOL_SCHEMA"))).toBe(true);
  });

  it("assertRpcBridgeReady flags server dispatch not wired to rpcCall", () => {
    const badDir = tmpDir();
    scaffoldProject(analysis, badDir, FRAMEWORK_DIR);
    writeFileSync(resolve(badDir, "src/server.ts"), "export function createServer() { return null; }\n");
    const errors = assertRpcBridgeReady(badDir);
    expect(errors.some((e) => e.includes("tools/list"))).toBe(true);
    expect(errors.some((e) => e.includes("tools/call"))).toBe(true);
    expect(errors.some((e) => e.includes("rpcCall"))).toBe(true);
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
      execFile(commandFile("npm"), commandArgs("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund", "--ignore-scripts"]), { cwd: projectDir, maxBuffer: 10 * 1024 * 1024, timeout: 180_000 }, (error) => {
        if (error) reject(error); else resolvePromise();
      });
    });
  });

  it("tsc build produces dist", { timeout: 60_000 }, async () => {
    const { execFile } = await import("child_process");
    await new Promise<void>((resolvePromise, reject) => {
      execFile(commandFile("npx"), commandArgs("npx", ["tsc"]), { cwd: projectDir, maxBuffer: 10 * 1024 * 1024, timeout: 60_000 }, (error) => {
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
