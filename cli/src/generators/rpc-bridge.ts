import type { AnalysisData } from "../types.js";

const RPC_TYPES = `import type { ExecResult } from "../executors/adb-executor.js";
import type { AdbConfig } from "../config.js";

export interface RpcCmd { readonly reqId: string; readonly op: string; readonly args: unknown; }
export interface RpcResult { readonly reqId: string; readonly ok: boolean; readonly data?: unknown; readonly error?: { readonly code: string; readonly message: string }; }
export class RpcError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.name = "RpcError"; this.code = code; } }
export type Executor = (commandName: string, args: Record<string, unknown>, config: AdbConfig) => Promise<ExecResult>;
`;

function rpcEngine(): string {
  return `// dispatch 核心来自 @im/mcp-server-framework（rpc-spec），本文件为 server 运行时入口。
export {
  constructDbusCall, constructNativeCall,
  type RpcConfig, type DbusSpec, type NativeSpec, type RpcSpec,
} from "@im/mcp-server-framework";
`;
}

function rpcClient(appName: string): string {
  return `import { execute } from "../executors/adb-executor.js";
import type { AdbConfig } from "../config.js";
import { RpcError, type Executor, type RpcResult } from "./rpc-types.js";

const RPC_URL = "page://${appName}.yunos.com/rpcagent";
const CMD_PATH = "/sdcard/imrpc/cmd.json";
const RESULT_PATH = "/sdcard/imrpc/result.json";

let counter = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function safeParse(s: string): RpcResult | undefined { try { return JSON.parse(s.trim()) as RpcResult; } catch { return undefined; } }

export async function rpcCall(op: string, args: unknown, config: AdbConfig, executor: Executor = execute, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 150;
  const reqId = "r-" + Date.now() + "-" + (counter++);
  const cmdJson = JSON.stringify({ reqId, op, args });
  await executor("shell", { cmd: "printf '%s' '" + cmdJson + "' > " + CMD_PATH }, config);
  const sl = await executor("sendlink", { url: RPC_URL }, config);
  if (!sl.success) await executor("sendlink", { url: RPC_URL }, config);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await executor("shell", { cmd: "cat " + RESULT_PATH }, config);
    const p = safeParse(r.rawOutput);
    if (p && p.reqId === reqId) { if (!p.ok) throw new RpcError(p.error?.code ?? "RPC_ERROR", p.error?.message ?? ""); return p.data; }
    await sleep(intervalMs);
  }
  throw new RpcError("RPC_TIMEOUT", "no response for " + op);
}
export { RpcError };
`;
}

const ADB_EXECUTOR = `import { spawn } from "node:child_process";
import type { AdbConfig } from "../config.js";

export interface ExecResult { readonly success: boolean; readonly rawOutput: string; readonly parsed?: unknown; }
type CommandHandler = (args: Record<string, unknown>) => string;
const commandRegistry = new Map<string, CommandHandler>();
export function registerCommand(name: string, handler: CommandHandler): void { commandRegistry.set(name, handler); }
export function clearCommands(): void { commandRegistry.clear(); }
export function getRegisteredCommands(): string[] { return Array.from(commandRegistry.keys()); }

export async function execute(commandName: string, args: Record<string, unknown>, config: AdbConfig): Promise<ExecResult> {
  const handler = commandRegistry.get(commandName);
  if (!handler) return { success: false, rawOutput: "unknown command: " + commandName };
  const argString = handler(args);
  const fullArgs = [...(config.use_host ? ["-host"] : []), ...argString.split(/\\s+/).filter(Boolean)];
  return new Promise<ExecResult>((resolveResult) => {
    let stdout = "";
    const child = spawn(config.path, fullArgs, { timeout: config.timeout_ms });
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.on("error", (err) => { resolveResult({ success: false, rawOutput: "spawn error: " + err.message }); });
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      if (code === 0 && trimmed.startsWith("SUCCESS:")) {
        const jsonPart = trimmed.slice("SUCCESS:".length).trim();
        let parsed: unknown; try { parsed = JSON.parse(jsonPart); } catch { parsed = undefined; }
        resolveResult({ success: true, rawOutput: trimmed, parsed });
      } else { resolveResult({ success: false, rawOutput: trimmed || "exit code " + code }); }
    });
  });
}

registerCommand("sendlink", (args) => "shell sendlink " + String(args.url));
registerCommand("shell", (args) => "shell " + String(args.cmd));
`;

export function generateRpcBridge(analysis: AnalysisData): Map<string, string> {
  const appName = analysis.app.name;
  const result = new Map<string, string>();
  result.set("src/rpc/rpc-types.ts", RPC_TYPES);
  result.set("src/rpc/rpc-engine.ts", rpcEngine());
  result.set("src/rpc/rpc-client.ts", rpcClient(appName));
  result.set("src/executors/adb-executor.ts", ADB_EXECUTOR);
  return result;
}
