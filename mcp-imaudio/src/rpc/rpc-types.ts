import type { ExecResult } from "../executors/adb-executor.js";
import type { AdbConfig } from "../config.js";

/** PC → 车机：写入 /sdcard/imrpc/cmd.json */
export interface RpcCmd {
  readonly reqId: string;
  readonly op: string;
  readonly args: unknown;
}

/** 车机 → PC：写入 /sdcard/imrpc/result.json */
export interface RpcResult {
  readonly reqId: string;
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

/** rpcCall 抛出的错误 */
export class RpcError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

/** adb-executor.execute 的签名，便于注入 mock 测 */
export type Executor = (
  commandName: string,
  args: Record<string, unknown>,
  config: AdbConfig,
) => Promise<ExecResult>;
