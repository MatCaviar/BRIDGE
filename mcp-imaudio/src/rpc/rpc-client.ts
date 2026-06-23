import { execute } from "../executors/adb-executor.js";
import type { AdbConfig } from "../config.js";
import { RpcError, type Executor, type RpcResult } from "./rpc-types.js";

const RPC_URL = "page://imaudio.yunos.com/rpcagent";
const CMD_PATH = "/sdcard/imrpc/cmd.json";
const RESULT_PATH = "/sdcard/imrpc/result.json";

let counter = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function safeParse(s: string): RpcResult | undefined {
  try { return JSON.parse(s.trim()) as RpcResult; } catch { return undefined; }
}

/**
 * 经 file/sendlink 桥调车机 rpc 引擎。
 * @param op config 里的 op key
 * @param args 请求参数
 * @param config adb 配置
 * @param executor 注入测（默认真 execute）
 * @param opts 超时/轮询间隔（测用小值）
 */
export async function rpcCall(
  op: string,
  args: unknown,
  config: AdbConfig,
  executor: Executor = execute,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const intervalMs = opts.intervalMs ?? 150;
  const reqId = `r-${Date.now()}-${counter++}`;
  const cmdJson = JSON.stringify({ reqId, op, args });

  // 1. 写 cmd（printf '%s' 避免 echo 转义；JSON 无单引号，安全）
  await executor("shell", { cmd: `printf '%s' '${cmdJson}' > ${CMD_PATH}` }, config);
  // 2. sendlink 触发（失败重试 1 次，扛设备睡眠）
  const sl = await executor("sendlink", { url: RPC_URL }, config);
  if (!sl.success) await executor("sendlink", { url: RPC_URL }, config);
  // 3. 轮询 cat result，匹配 reqId
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await executor("shell", { cmd: `cat ${RESULT_PATH}` }, config);
    const p = safeParse(r.rawOutput);
    if (p && p.reqId === reqId) {
      if (!p.ok) throw new RpcError(p.error?.code ?? "RPC_ERROR", p.error?.message ?? "");
      return p.data;
    }
    await sleep(intervalMs);
  }
  throw new RpcError("RPC_TIMEOUT", `no response for ${op}`);
}

export { RpcError };
