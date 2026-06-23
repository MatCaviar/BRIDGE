import { describe, it, expect } from "vitest";
import { rpcCall, RpcError } from "../../src/rpc/rpc-client.js";
import type { Executor } from "../../src/rpc/rpc-types.js";
import type { AdbConfig } from "../../src/config.js";

const CFG: AdbConfig = { path: "adb", use_host: true, timeout_ms: 10000 };

/** mock executor：模拟车机引擎——先吞 cmd、sendlink；cat 第 1 次空，第 2 次回对应 reqId 的 result。 */
function makeExecutor(
  resultForReqId: (reqId: string) => { ok: boolean; data?: unknown; error?: { code: string; message: string } },
): Executor {
  let lastReqId = "";
  let catCount = 0;
  return async (cmd, args) => {
    if (cmd === "shell") {
      const c = String(args.cmd);
      if (c.startsWith("printf")) {
        const m = c.match(/"reqId":"([^"]+)"/);
        lastReqId = m?.[1] ?? "";
        return { success: true, rawOutput: "" };
      }
      if (c.startsWith("cat ")) {
        catCount++;
        if (catCount === 1 || !lastReqId) return { success: true, rawOutput: "" };
        const r = resultForReqId(lastReqId);
        return { success: true, rawOutput: JSON.stringify({ reqId: lastReqId, ...r }) };
      }
    }
    if (cmd === "sendlink") return { success: true, rawOutput: "SUCCESS" };
    return { success: false, rawOutput: "unhandled" };
  };
}

describe("rpcCall", () => {
  it("returns data on ok response (after one empty poll)", async () => {
    const ex = makeExecutor(() => ({ ok: true, data: { mode: "all", fade: 0, balance: 0 } }));
    const data = await rpcCall("soundstage.read", {}, CFG, ex, { timeoutMs: 1000, intervalMs: 20 });
    expect(data).toEqual({ mode: "all", fade: 0, balance: 0 });
  });

  it("throws RpcError on ok:false", async () => {
    const ex = makeExecutor(() => ({ ok: false, error: { code: "RPC_ERROR", message: "boom" } }));
    await expect(rpcCall("soundstage.read", {}, CFG, ex, { timeoutMs: 1000, intervalMs: 20 }))
      .rejects.toMatchObject({ code: "RPC_ERROR", message: "boom" });
  });

  it("throws RPC_TIMEOUT when no matching reqId within deadline", async () => {
    const ex: Executor = async (cmd) => {
      if (cmd === "shell") return { success: true, rawOutput: JSON.stringify({ reqId: "stale", ok: true, data: {} }) };
      if (cmd === "sendlink") return { success: true, rawOutput: "SUCCESS" };
      return { success: true, rawOutput: "" };
    };
    await expect(rpcCall("soundstage.read", {}, CFG, ex, { timeoutMs: 300, intervalMs: 50 }))
      .rejects.toMatchObject({ code: "RPC_TIMEOUT" });
  });
});
