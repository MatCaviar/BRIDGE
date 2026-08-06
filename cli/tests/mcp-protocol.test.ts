import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { scaffoldProject } from "../src/commands/scaffold.js";
import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";
import { readFileSync, existsSync, rmSync } from "fs";
import { randomUUID } from "crypto";

const FIXTURE = resolve(import.meta.dirname, "../../schema/__tests__/fixtures/valid-analysis.json");
const FRAMEWORK_DIR = resolve(import.meta.dirname, "../../framework");
const TMP_ROOT = resolve(import.meta.dirname, "../_protocol_tmp");

function tmpDir(): string {
  return resolve(TMP_ROOT, `proto-${randomUUID().slice(0, 8)}`);
}

function commandFile(cmd: "npm" | "npx"): string {
  return process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : cmd;
}

function commandArgs(cmd: "npm" | "npx", args: string[]): string[] {
  return process.platform === "win32" ? ["/d", "/s", "/c", cmd, ...args] : args;
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows */ }
  }
}, 60_000);

interface JsonRpcResponse {
  jsonrpc: string;
  id?: number;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

function startServer(dir: string): Promise<{ child: ChildProcess; responses: JsonRpcResponse[] }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", [resolve(dir, "dist", "index.js")], {
      cwd: dir,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const responses: JsonRpcResponse[] = [];
    let buffer = "";

    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      // MCP uses newline-delimited JSON
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          responses.push(JSON.parse(trimmed));
        } catch {
          // Not JSON — might be a content line, skip
        }
      }
    });

    const stderrChunks: string[] = [];
    child.stderr.on("data", (data: Buffer) => stderrChunks.push(data.toString()));

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Server startup timed out. stderr: ${stderrChunks.join("")}`));
    }, 10_000);

    // Wait for server to be ready
    child.stderr.on("data", () => {
      if (stderrChunks.join("").includes("[mcp-server]")) {
        clearTimeout(timeout);
        resolvePromise({ child, responses });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function sendJsonRpc(child: ChildProcess, id: number, method: string, params?: any): void {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} });
  child.stdin.write(msg + "\n");
}

describe("MCP protocol integration", () => {
  const analysis = JSON.parse(readFileSync(FIXTURE, "utf-8"));
  const outDir = tmpDir();
  let child: ChildProcess;
  let responses: JsonRpcResponse[];

  // Setup: scaffold, build, start server
  beforeAll(async () => {
    scaffoldProject(analysis, outDir, FRAMEWORK_DIR);

    // Install and build
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(execFile);

    await execAsync(commandFile("npm"), commandArgs("npm", ["install", "--prefer-offline", "--no-audit", "--no-fund", "--ignore-scripts"]), { cwd: outDir });
    await execAsync(commandFile("npx"), commandArgs("npx", ["tsc"]), { cwd: outDir });

    const server = await startServer(outDir);
    child = server.child;
    responses = server.responses;
  }, 120_000);

  afterAll(() => {
    child?.kill();
  });

  it("responds to initialize with server info and capabilities", async () => {
    sendJsonRpc(child, 1, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" },
    });

    // Wait for response
    await new Promise((r) => setTimeout(r, 500));

    const resp = responses.find((r) => r.id === 1);
    expect(resp, "No response to initialize").toBeDefined();
    expect(resp!.error, `initialize error: ${JSON.stringify(resp!.error)}`).toBeUndefined();
    expect(resp!.result).toBeDefined();
    expect(resp!.result.serverInfo).toBeDefined();
    expect(resp!.result.capabilities).toBeDefined();
  });

  it("responds to tools/list with all 3 tools + health_check", async () => {
    sendJsonRpc(child, 2, "tools/list", {});

    await new Promise((r) => setTimeout(r, 500));

    const resp = responses.find((r) => r.id === 2);
    expect(resp, "No response to tools/list").toBeDefined();
    expect(resp!.error, `tools/list error: ${JSON.stringify(resp!.error)}`).toBeUndefined();

    const tools = resp!.result.tools;
    expect(tools).toBeDefined();
    const toolNames = tools.map((t: any) => t.name);

    // 3 analysis capabilities + health_check
    expect(toolNames).toContain("navigate_to");
    expect(toolNames).toContain("capture_pet");
    expect(toolNames).toContain("read_gear_status");
    expect(toolNames).toContain("health_check");
    expect(toolNames.length).toBe(4);
  });

  it("tool schemas match analysis params", async () => {
    const resp = responses.find((r) => r.id === 2);
    const tools = resp!.result.tools;

    const captureTool = tools.find((t: any) => t.name === "capture_pet");
    expect(captureTool).toBeDefined();
    expect(captureTool.inputSchema.properties.fps).toBeDefined();
    expect(captureTool.inputSchema.properties.fps.type).toBe("number");

    const navTool = tools.find((t: any) => t.name === "navigate_to");
    expect(navTool).toBeDefined();
    expect(navTool.inputSchema.properties.pageName).toBeDefined();
  });

  it("executes navigate_to tool and returns success", async () => {
    sendJsonRpc(child, 3, "tools/call", {
      name: "navigate_to",
      arguments: { pageName: "home" },
    });

    await new Promise((r) => setTimeout(r, 500));

    const resp = responses.find((r) => r.id === 3);
    expect(resp, "No response to tools/call navigate_to").toBeDefined();
    expect(resp!.error, `tools/call error: ${JSON.stringify(resp!.error)}`).toBeUndefined();

    expect(resp!.result.content).toBeDefined();
    expect(resp!.result.content[0].type).toBe("text");

    const data = JSON.parse(resp!.result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.data).toBeDefined();
  });

  it("executes read_gear_status and returns mock data", async () => {
    sendJsonRpc(child, 4, "tools/call", {
      name: "read_gear_status",
      arguments: {},
    });

    await new Promise((r) => setTimeout(r, 500));

    const resp = responses.find((r) => r.id === 4);
    expect(resp, "No response to tools/call read_gear_status").toBeDefined();
    expect(resp!.error, `tools/call error: ${JSON.stringify(resp!.error)}`).toBeUndefined();

    const data = JSON.parse(resp!.result.content[0].text);
    expect(data.success).toBe(true);
    expect(data.data.isParked).toBe(true);
  });

  it("executes capture_pet with number param", async () => {
    sendJsonRpc(child, 5, "tools/call", {
      name: "capture_pet",
      arguments: { fps: 30 },
    });

    await new Promise((r) => setTimeout(r, 500));

    const resp = responses.find((r) => r.id === 5);
    expect(resp, "No response to tools/call capture_pet").toBeDefined();
    expect(resp!.error, `tools/call error: ${JSON.stringify(resp!.error)}`).toBeUndefined();

    const data = JSON.parse(resp!.result.content[0].text);
    expect(data.success).toBe(true);
  });

  it("health_check returns ok status", async () => {
    sendJsonRpc(child, 6, "tools/call", {
      name: "health_check",
      arguments: {},
    });

    await new Promise((r) => setTimeout(r, 500));

    const resp = responses.find((r) => r.id === 6);
    expect(resp, "No response to health_check").toBeDefined();
    expect(resp!.error, `health_check error: ${JSON.stringify(resp!.error)}`).toBeUndefined();

    const data = JSON.parse(resp!.result.content[0].text);
    expect(data.data.status).toBe("ok");
  });
});
