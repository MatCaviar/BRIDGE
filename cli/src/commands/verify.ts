import { spawn, spawnSync, type ChildProcess } from "child_process";
import { resolve, basename } from "path";
import { readFileSync, existsSync } from "fs";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

function truncate(s: string, max = 500): string {
  return s.length <= max ? s : s.slice(0, max) + "… [truncated]";
}

/** Check 1: `npm install` + `tsc --noEmit` zero-error in the generated project. Deterministic + local. */
export function runInstallAndTypecheck(projectDir: string): string[] {
  const errors: string[] = [];
  const install = spawnSync("npm", ["install", "--no-fund", "--no-audit"], {
    cwd: projectDir,
    encoding: "utf-8",
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (install.status !== 0) {
    errors.push(
      "npm install failed (exit " + install.status + "): " +
        truncate((install.stderr ?? "") + (install.stdout ?? "")),
    );
    return errors; // skip tsc if install failed
  }
  const tsc = spawnSync("npx", ["tsc", "--noEmit"], {
    cwd: projectDir,
    encoding: "utf-8",
    shell: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (tsc.status !== 0) {
    errors.push(
      "tsc --noEmit failed (exit " + tsc.status + "): " +
        truncate((tsc.stderr ?? "") + (tsc.stdout ?? "")),
    );
  }
  return errors;
}

/** Check 3: rpc-bridge static readiness (no throw stubs, RPC_URL present, framework re-exported). */
export function assertRpcBridgeReady(projectDir: string): string[] {
  const errors: string[] = [];
  const adapterPath = resolve(projectDir, "src/adapters/yunos-adapter.ts");
  const clientPath = resolve(projectDir, "src/rpc/rpc-client.ts");
  const enginePath = resolve(projectDir, "src/rpc/rpc-engine.ts");

  for (const [label, p] of [["yunos-adapter", adapterPath], ["rpc-client", clientPath], ["rpc-engine", enginePath]] as const) {
    if (!existsSync(p)) {
      errors.push("rpc-bridge missing " + label + ": " + p);
    }
  }
  if (errors.length > 0) return errors;

  const adapter = readFileSync(adapterPath, "utf-8");
  if (/throw\s+(["'`])not implemented\1/i.test(adapter) || /throw\s+new\s+Error\(\s*(["'`])Not implemented/i.test(adapter)) {
    errors.push("yunos-adapter.ts still has a `throw ... not implemented` stub — RPC bridge not wired.");
  }

  const client = readFileSync(clientPath, "utf-8");
  if (!/RPC_URL/.test(client)) {
    errors.push("rpc-client.ts is missing RPC_URL — RPC bridge target undefined.");
  }

  const engine = readFileSync(enginePath, "utf-8");
  if (!/@im\/mcp-server-framework/.test(engine)) {
    errors.push("rpc-engine.ts does not re-export @im/mcp-server-framework — dispatch core missing.");
  }
  return errors;
}

export interface VerifyResult {
  readonly serverName: string;
  readonly connected: boolean;
  readonly toolCount: number;
  readonly tools: readonly string[];
  readonly errors: readonly string[];
}

function sendJsonRpc(child: ChildProcess, id: number, method: string, params?: any): void {
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} });
  child.stdin?.write(msg + "\n");
}

async function discoverTools(entryPath: string): Promise<{ toolCount: number; tools: string[]; callResponsive: boolean }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("node", [entryPath], { stdio: ["pipe", "pipe", "pipe"] });

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("Server startup timed out (10s)"));
    }, 10_000);

    let buffer = "";
    const responses: any[] = [];

    child.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try { responses.push(JSON.parse(trimmed)); } catch {}
      }
    });

    const stderrChunks: string[] = [];
    child.stderr.on("data", (data: Buffer) => stderrChunks.push(data.toString()));

    child.stderr.on("data", () => {
      if (stderrChunks.join("").includes("[mcp-server]")) {
        sendJsonRpc(child, 1, "initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "mcp-pipeline-verify", version: "1.0" },
        });
        sendJsonRpc(child, 2, "tools/list", {});

        // Check 2 (responsiveness): after tools/list, send a tools/call for the first
        // tool and confirm ANY JSON-RPC response (result or error) comes back. A
        // param-validation error response is acceptable — it proves the server did
        // not crash and is dispatching. Wait 400ms for tools/list to arrive first.
        setTimeout(() => {
          const toolsResp = responses.find((r: any) => r.id === 2);
          const firstTool: string | undefined = toolsResp?.result?.tools?.[0]?.name;
          if (firstTool) {
            sendJsonRpc(child, 3, "tools/call", { name: firstTool, arguments: {} });
          }
        }, 400);

        setTimeout(() => {
          child.kill();
          clearTimeout(timeout);

          const toolsResp = responses.find((r: any) => r.id === 2);
          if (toolsResp?.result?.tools) {
            const tools = toolsResp.result.tools.map((t: any) => t.name);
            // Responsiveness = a response with id=3 arrived (result OR error), OR no
            // tools/call was sent (no tools). A crash/NO response for id=3 is a failure.
            const callResp = responses.find((r: any) => r.id === 3);
            const hadCall = toolsResp.result.tools.length > 0;
            const callResponsive = hadCall ? Boolean(callResp && ("result" in callResp || "error" in callResp)) : true;
            resolvePromise({ toolCount: tools.length, tools, callResponsive });
          } else {
            reject(new Error("Failed to discover tools. Responses: " + JSON.stringify(responses)));
          }
        }, 1500);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

export async function verifyCommand(args: string[]): Promise<void> {
  const dirIdx = args.indexOf("--dir");
  const gatewayIdx = args.indexOf("--gateway");

  if (dirIdx === -1) {
    throw new Error("Usage: mcp-pipeline verify --dir <project-dir> [--gateway <gateway-dir>]");
  }

  const dirArg = args[dirIdx + 1];
  const gatewayArg = gatewayIdx !== -1 ? args[gatewayIdx + 1] : null;

  if (!dirArg || dirArg.startsWith("--")) {
    throw new Error("--dir requires a value");
  }
  if (gatewayArg !== null && (gatewayArg.startsWith("--") || !gatewayArg)) {
    throw new Error("--gateway requires a value");
  }

  const projectDir = resolve(dirArg);

  if (!existsSync(projectDir)) {
    throw new Error("Project directory not found: " + projectDir);
  }

  const pkg = JSON.parse(readFileSync(resolve(projectDir, "package.json"), "utf-8"));
  const serverName = pkg.name ?? "unknown";

  let state = readState(String(serverName)) ?? createInitialState(String(serverName), projectDir);
  try {
    state = updateStep(state, "verify", { status: "in_progress" });
    writeState(state);
  } catch {}

  const errors: string[] = [];

  const distPath = resolve(projectDir, "dist", "index.js");
  if (!existsSync(distPath)) {
    errors.push("Built entry point not found: " + distPath + ". Run 'mcp-pipeline build' first.");
  }

  if (gatewayArg) {
    const gatewayDir = resolve(gatewayArg);
    const configPath = resolve(gatewayDir, "config.yaml");
    if (existsSync(configPath)) {
      const config = readFileSync(configPath, "utf-8");
      if (!config.includes(serverName)) {
        errors.push("Server " + serverName + " not found in gateway config. Run 'mcp-pipeline register' first.");
      }
    } else {
      errors.push("Gateway config not found: " + configPath);
    }
  }

  let toolCount = 0;
  let tools: string[] = [];

  if (errors.length === 0) {
    try {
      const discovery = await discoverTools(distPath);
      toolCount = discovery.toolCount;
      tools = discovery.tools;
      if (!discovery.callResponsive) {
        errors.push("tools/call responsiveness check failed: server sent no JSON-RPC response for tools/call (id=3) and/or crashed.");
      }
    } catch (error) {
      errors.push("Tool discovery failed: " + (error instanceof Error ? error.message : String(error)));
    }
  }

  // SP-D: prove the generated server is genuinely usable post-build (local + deterministic).
  if (errors.length === 0) {
    for (const e of runInstallAndTypecheck(projectDir)) errors.push(e);
  }
  if (errors.length === 0) {
    for (const e of assertRpcBridgeReady(projectDir)) errors.push(e);
  }

  if (errors.length > 0) {
    const errorMsg = errors.map((e) => "  - " + e).join("\n");
    try {
      state = updateStep(state, "verify", { status: "failed", error: errorMsg });
      writeState(state);
    } catch {}
    throw new Error("Verify FAILED for " + serverName + ":\n" + errorMsg);
  }

  try {
    state = updateStep(state, "verify", { status: "completed" });
    writeState(state);
  } catch {}
  process.stdout.write("Verified: " + serverName + "\n");
  process.stdout.write("  Tools: " + toolCount + " discovered (" + tools.join(", ") + ")\n");
}