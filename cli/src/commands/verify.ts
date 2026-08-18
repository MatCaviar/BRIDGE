import { spawn, spawnSync, type ChildProcess } from "child_process";
import { resolve, basename } from "path";
import { readFileSync, existsSync } from "fs";
import { readState, writeState, createInitialState, updateStep, appNameFromProjectDir } from "../state/manager.js";

function truncate(s: string, max = 500): string {
  return s.length <= max ? s : s.slice(0, max) + "… [truncated]";
}

function commandFile(command: "npm" | "npx"): string {
  return process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command;
}

function commandArgs(command: "npm" | "npx", args: string[]): string[] {
  return process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
}

/** Check 1: `npm install` + `tsc --noEmit` zero-error in the generated project. Deterministic + local. */
export function runInstallAndTypecheck(projectDir: string): string[] {
  const errors: string[] = [];
  const install = spawnSync(commandFile("npm"), commandArgs("npm", ["install", "--no-fund", "--no-audit"]), {
    cwd: projectDir,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (install.status !== 0) {
    errors.push(
      "npm install failed (exit " + install.status + "): " +
        truncate((install.stderr ?? "") + (install.stdout ?? "")),
    );
    return errors; // skip tsc if install failed
  }
  const tsc = spawnSync(commandFile("npx"), commandArgs("npx", ["tsc", "--noEmit"]), {
    cwd: projectDir,
    encoding: "utf-8",
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

/** Check 3: schema-first server + rpc-bridge static readiness. */
export function assertRpcBridgeReady(projectDir: string): string[] {
  const errors: string[] = [];
  const schemaPath = resolve(projectDir, "src/tools/schema.ts");
  const serverPath = resolve(projectDir, "src/server.ts");
  const adapterIndexPath = resolve(projectDir, "src/adapters/index.ts");
  const clientPath = resolve(projectDir, "src/rpc/rpc-client.ts");
  const enginePath = resolve(projectDir, "src/rpc/rpc-engine.ts");

  for (const [label, p] of [["tools/schema", schemaPath], ["server", serverPath], ["adapters/index", adapterIndexPath], ["rpc-client", clientPath], ["rpc-engine", enginePath]] as const) {
    if (!existsSync(p)) {
      errors.push("rpc-bridge missing " + label + ": " + p);
    }
  }
  if (errors.length > 0) return errors;

  const schema = readFileSync(schemaPath, "utf-8");
  if (!/\bTOOL_SCHEMA\b/.test(schema)) {
    errors.push("src/tools/schema.ts does not expose TOOL_SCHEMA — agent-facing tool schema missing.");
  }

  const server = readFileSync(serverPath, "utf-8");
  if (!/ListToolsRequestSchema/.test(server)) {
    errors.push("src/server.ts missing tools/list handler (ListToolsRequestSchema).");
  }
  if (!/CallToolRequestSchema/.test(server)) {
    errors.push("src/server.ts missing tools/call handler (CallToolRequestSchema).");
  }
  if (!/TOOL_SCHEMA/.test(server)) {
    errors.push("src/server.ts does not expose TOOL_SCHEMA through tools/list.");
  }
  if (!/rpcCall\(\s*name\s*,/.test(server)) {
    errors.push("src/server.ts does not dispatch tools/call by tool name through rpcCall(name, args).");
  }

  const adapterIndex = readFileSync(adapterIndexPath, "utf-8");
  if (!/rpcCall/.test(adapterIndex)) {
    errors.push("adapters/index.ts has no rpcCall — dynamic dispatch not wired.");
  }
  if (/throw\s+(["'`])not implemented\1/i.test(adapterIndex) || /throw\s+new\s+Error\(\s*(["'`])Not implemented/i.test(adapterIndex)) {
    errors.push("adapters/index.ts still has a `throw ... not implemented` stub — RPC bridge not wired.");
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

function sampleValue(schema: any): unknown {
  if (Array.isArray(schema?.enum) && schema.enum.length > 0) return schema.enum[0];
  switch (schema?.type) {
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "array":
      return [];
    case "object":
      return sampleArguments(schema);
    case "string":
    default:
      return "x";
  }
}

function sampleArguments(inputSchema: any): Record<string, unknown> {
  const properties = inputSchema?.properties;
  if (!properties || typeof properties !== "object") return {};
  const required = Array.isArray(inputSchema?.required) ? inputSchema.required : Object.keys(properties);
  const args: Record<string, unknown> = {};
  for (const name of required) {
    if (typeof name === "string" && Object.prototype.hasOwnProperty.call(properties, name)) {
      args[name] = sampleValue(properties[name]);
    }
  }
  return args;
}

export async function discoverTools(entryPath: string): Promise<{ toolCount: number; tools: string[]; callSucceeded: boolean; callError?: string }> {
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
          const listedTools: any[] = Array.isArray(toolsResp?.result?.tools) ? toolsResp.result.tools : [];
          const businessTools = listedTools.filter((t) => t?.name && t.name !== "health_check");
          const probes = businessTools.length > 0 ? businessTools : listedTools.filter((t) => t?.name);
          probes.forEach((tool, index) => {
            sendJsonRpc(child, 3 + index, "tools/call", { name: tool.name, arguments: sampleArguments(tool.inputSchema) });
          });
        }, 400);

        setTimeout(() => {
          child.kill();
          clearTimeout(timeout);

          const toolsResp = responses.find((r: any) => r.id === 2);
          if (toolsResp?.result?.tools) {
            const listedTools: any[] = toolsResp.result.tools;
            const tools = listedTools.map((t: any) => t.name);
            const businessTools = listedTools.filter((t: any) => t?.name && t.name !== "health_check");
            const probes = businessTools.length > 0 ? businessTools : listedTools.filter((t: any) => t?.name);
            const failures: string[] = [];
            probes.forEach((tool: any, index: number) => {
              const callResp = responses.find((r: any) => r.id === 3 + index);
              if (!callResp) failures.push(`${tool.name}: no JSON-RPC response`);
              else if ("error" in callResp) failures.push(`${tool.name}: ${JSON.stringify(callResp.error)}`);
              else if (!("result" in callResp)) failures.push(`${tool.name}: response missing result`);
            });
            const callSucceeded = failures.length === 0;
            const callError = callSucceeded ? undefined : failures.join("; ");
            resolvePromise({ toolCount: tools.length, tools, callSucceeded, callError });
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

  let state = readState(appNameFromProjectDir(projectDir)) ?? createInitialState(appNameFromProjectDir(projectDir), projectDir);
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
      if (!discovery.callSucceeded) {
        errors.push("tools/call check failed: " + (discovery.callError ?? "server did not return a JSON-RPC result for tools/call (id=3)."));
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
