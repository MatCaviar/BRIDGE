# 车内 RPC Agent — Phase 1（桥 + 基础设施）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通"本地 e2e → MCP → 车机 imaudio 精细功能"的桥，以 soundstage read/set 为验证 op，建立可泛化的数据驱动 rpc 基础设施（通用引擎 + per-app 配置 + PC 客户端 + mock）。

**Architecture:** PC 端 mcp-imaudio 加 `rpc-client`（写 cmd → sendlink 触发 → 轮询 cat result）；车机端加一个通用 `RpcEngine` 页（读 config + cmd → 按 type=dbus|native 通用 dispatch → 写 result → 自销毁）；config 数据驱动、可 push 迭代。车机源码交同事构建（Option B），PC 侧 + 一个 Node 参考引擎本地 TDD。

**Tech Stack:** TypeScript (Node, mcp-imaudio: vitest + tsc + npm run build); TypeScript (agil, 车机 RpcEngine — 不本地跑测，靠 Node 参考镜像 + 对照 proxy 源码 review).

**Spec:** `D:\IM\im-mcp-codeagent\docs\specs\2026-06-23-in-car-rpc-agent-design.md`

## Global Constraints（spec §2，所有 task 隐含遵守）

- 桥只用已验证原语：`sendlink`（无参拉起）、文件、`adb shell`；**不开网络口**。
- rpc 页每次执行完**自销毁**（`onStart → 干活 → finish()`）。
- **Option B**：车机侧只产源码交同事构建装 `.ypp`；**不本地构建车机包**。PC 侧我们自建。
- **数据驱动 dispatch**：引擎通用，靠 `/sdcard/imrpc/config.json` 驱动；config 可 push 迭代。
- e2e / tool / schema / analysis.json **不变**，只换 yunos-adapter 底层。
- 项目**非 git 仓库**：commit 步骤作验证检查点（若是 git 则执行）。
- 车机 RpcEngine.ts **无法本地跑测**：靠 Node 参考引擎（rpc-engine.ts）镜像同一 dispatch 逻辑（有测）+ 对照 `AudioPolicyProxy.ts` review。

---

## File Structure

| 文件 | 责任 | 动作 | 侧 |
|------|------|------|----|
| `mcp-imaudio/src/rpc/rpc-types.ts` | Cmd / RpcResult / RpcError / Executor 类型 | 新建 | PC |
| `mcp-imaudio/src/executors/adb-executor.ts` | 加 `shell` 命令 | 修改 | PC |
| `mcp-imaudio/src/rpc/rpc-engine.ts` | Node 参考：constructDbusCall/constructNativeCall（dispatch 算法，有测） | 新建 | PC |
| `mcp-imaudio/src/rpc/rpc-client.ts` | rpcCall 编排（写cmd→sendlink→轮询cat→reqId→超时→重试） | 新建 | PC |
| `mcp-imaudio/src/adapters/yunos-adapter.ts` | soundstage read/set：throw→rpcCall + DTO 映射 | 修改 | PC |
| `mcp-imaudio/tests/unit/rpc-engine.test.ts` | dispatch 构造逻辑测试 | 新建 | PC |
| `mcp-imaudio/tests/unit/rpc-client.test.ts` | rpcCall 编排测试（mock executor） | 新建 | PC |
| `mcp-imaudio/tests/unit/yunos-adapter-soundstage.test.ts` | adapter soundstage→rpcCall 映射测试 | 新建 | PC |
| `imaudio_app_code/rpc/config.json` | imaudio soundstage 配置（推到 /sdcard/imrpc/config.json） | 新建 | 车机（数据） |
| `imaudio_app_code/ts/RpcEngine.ts` | 通用引擎页（TS/agil，交同事） | 新建 | 车机（源码） |
| `imaudio_app_code/manifest.json` | 加 rpcagent page 项 | 修改 | 车机（源码） |

---

## Task 1: RPC 共享类型（rpc-types.ts）

**Files:**
- Create: `mcp-imaudio/src/rpc/rpc-types.ts`

**Interfaces:**
- Produces: `RpcCmd`、`RpcResult`、`RpcError`、`Executor`（后续 task 用）。

- [ ] **Step 1: 写类型文件**

创建 `mcp-imaudio/src/rpc/rpc-types.ts`：
```typescript
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
```

- [ ] **Step 2: 类型检查**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 3: 检查点**

---

## Task 2: adb-executor 加 `shell` 命令（TDD）

**Files:**
- Modify: `mcp-imaudio/src/executors/adb-executor.ts`（末尾 `registerCommand("sendlink", ...)` 之后追加）
- Test: `mcp-imaudio/tests/unit/adb-executor.test.ts`（已存在，追加用例）

**Interfaces:**
- Produces: `execute("shell", { cmd: "<shellcmd>" }, config)` 可用，跑 `adb -host shell <shellcmd>`。

- [ ] **Step 1: 写失败测试（追加到 adb-executor.test.ts 的 describe 块内）**

在 `mcp-imaudio/tests/unit/adb-executor.test.ts` 的 `describe("adb-executor command registry", ...)` 内追加：
```typescript
  it("shell command is registered", async () => {
    registerCommand("shell", (a) => `shell ${String(a.cmd)}`);
    expect(getRegisteredCommands()).toContain("shell");
  });
```
> `getRegisteredCommands` 已在 adb-executor.ts 导出（line 22）。真机往返在 Task 8 验。

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/adb-executor.test.ts`
Expected: FAIL（`shell` 未注册，`toContain("shell")` 不成立）

- [ ] **Step 3: 注册 shell 命令**

在 `mcp-imaudio/src/executors/adb-executor.ts` 末尾（`registerCommand("sendlink", ...)` 之后）追加：
```typescript
registerCommand("shell", (args) => `shell ${String(args.cmd)}`);
```

- [ ] **Step 4: 运行确认通过**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/adb-executor.test.ts`
Expected: 新增用例 PASS（"sendlink command resolves against real device" 设备离线时仍失败——既有的设备相关测试，非本 task 引入，属 Task 8 范畴）

- [ ] **Step 5: 检查点**

---

## Task 3: Node 参考 rpc-engine dispatch 逻辑（TDD）

**Files:**
- Create: `mcp-imaudio/src/rpc/rpc-engine.ts`
- Test: `mcp-imaudio/tests/unit/rpc-engine.test.ts`

**Interfaces:**
- Produces: `RpcConfig`、`DbusSpec`、`NativeSpec` 类型；`constructDbusCall(spec, args)`、`constructNativeCall(spec, args)` 纯函数。Task 6 用它验证 config；Task 7 的车机 TS 引擎镜像此逻辑。

- [ ] **Step 1: 写失败测试**

创建 `mcp-imaudio/tests/unit/rpc-engine.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { constructDbusCall, constructNativeCall } from "../../src/rpc/rpc-engine.js";
import type { DbusSpec, NativeSpec } from "../../src/rpc/rpc-engine.js";

describe("constructDbusCall", () => {
  it("interpolates ${vars} and stringifies listed paths", () => {
    const spec: DbusSpec = {
      type: "dbus",
      bus: "com.yunos.audiopolicyservice",
      path: "/com/yunos/audiopolicyservice",
      method: "request",
      arg: {
        funcName: "audiopolicyservice.yunos.com/baseModeules/requstSetSoundEffectsMode",
        data: { mode: "${mode}", fade: "${fade}", balance: "${balance}" },
      },
      stringify: ["data"],
      reply: "json",
    };
    const call = constructDbusCall(spec, { mode: 1, fade: 0, balance: 0 });
    expect(call.bus).toBe("com.yunos.audiopolicyservice");
    expect(call.method).toBe("request");
    expect(call.reply).toBe("json");
    const arg = JSON.parse(call.argString);
    expect(arg.funcName).toContain("requstSetSoundEffectsMode");
    expect(typeof arg.data).toBe("string");
    expect(JSON.parse(arg.data)).toEqual({ mode: "1", fade: "0", balance: "0" });
  });

  it("no-op without stringify", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "b", path: "p", method: "request",
      arg: { funcName: "get" }, reply: "json",
    };
    const call = constructDbusCall(spec, {});
    expect(JSON.parse(call.argString)).toEqual({ funcName: "get" });
  });
});

describe("constructNativeCall", () => {
  it("resolves ${var} args and expr transforms", () => {
    const spec: NativeSpec = {
      type: "native",
      require: "yunos/device/AudioManager",
      factory: "getInstance",
      method: "setAudioEffectCustomizedEQ",
      args: ["${band}", "${centerFreq}", { expr: "${bandLevel} + 7" }],
    };
    const call = constructNativeCall(spec, { band: 3, centerFreq: 500, bandLevel: 2 });
    expect(call.require).toBe("yunos/device/AudioManager");
    expect(call.factory).toBe("getInstance");
    expect(call.method).toBe("setAudioEffectCustomizedEQ");
    expect(call.args).toEqual([3, 500, 9]); // bandLevel 2 + 7 = 9
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/rpc-engine.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 rpc-engine.ts**

创建 `mcp-imaudio/src/rpc/rpc-engine.ts`：
```typescript
/** Node 参考实现：车机 RpcEngine.ts（agil/TS）的 dispatch 算法镜像于此。本文件有单测；车机 TS 版是它的翻译。 */

export interface DbusSpec {
  readonly type: "dbus";
  readonly bus: string;
  readonly path: string;
  readonly method: string;
  readonly arg: unknown;          // 模板，可含 ${var}
  readonly stringify?: string[];  // arg 内需 JSON.stringify 的点分路径
  readonly reply: "json" | "string" | "int" | "double" | "bool";
}

export interface NativeSpec {
  readonly type: "native";
  readonly require: string;
  readonly factory?: string;      // 如 "getInstance"；无则 new
  readonly method: string;
  readonly args: unknown[];       // 每项可为 "${var}" 或 { expr: "..." }
}

export type RpcSpec = DbusSpec | NativeSpec;
export type RpcConfig = Record<string, RpcSpec>;

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

function interpolate(template: unknown, vars: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    return template.replace(/\$\{(\w+)\}/g, (_, k) =>
      vars[k] === undefined ? "" : String(vars[k]),
    );
  }
  if (Array.isArray(template)) return template.map((v) => interpolate(v, vars));
  if (template && typeof template === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(template as object)) {
      o[k] = interpolate((template as Record<string, unknown>)[k], vars);
    }
    return o;
  }
  return template;
}

function applyStringify(arg: Record<string, unknown>, paths: string[] = []): void {
  for (const p of paths) {
    const segs = p.split(".");
    let node: Record<string, unknown> = arg;
    for (let i = 0; i < segs.length - 1; i++) node = node[segs[i]] as Record<string, unknown>;
    const last = segs[segs.length - 1];
    node[last] = JSON.stringify(node[last]);
  }
}

export interface DbusCall {
  readonly bus: string;
  readonly path: string;
  readonly method: string;
  readonly argString: string;  // 写到 wire 的 JSON 字符串
  readonly reply: DbusSpec["reply"];
}

export function constructDbusCall(spec: DbusSpec, args: Record<string, unknown>): DbusCall {
  const arg = interpolate(clone(spec.arg), args) as Record<string, unknown>;
  applyStringify(arg, spec.stringify);
  return { bus: spec.bus, path: spec.path, method: spec.method, argString: JSON.stringify(arg), reply: spec.reply };
}

function evalExpr(expr: string, vars: Record<string, unknown>): unknown {
  const s = expr.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k] ?? 0));
  if (!/^[-+*/().\s\d]+$/.test(s)) throw new Error(`bad expr: ${expr}`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict"; return (${s});`)();
}

export interface NativeCall {
  readonly require: string;
  readonly factory?: string;
  readonly method: string;
  readonly args: unknown[];
}

export function constructNativeCall(spec: NativeSpec, args: Record<string, unknown>): NativeCall {
  const resolved = spec.args.map((a) => {
    if (typeof a === "string") return interpolate(a, args);
    if (a && typeof a === "object" && typeof (a as { expr?: string }).expr === "string") {
      return evalExpr((a as { expr: string }).expr, args);
    }
    return a;
  });
  return { require: spec.require, factory: spec.factory, method: spec.method, args: resolved };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/rpc-engine.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: 类型检查**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 6: 检查点**

---

## Task 4: rpc-client 编排（TDD）

**Files:**
- Create: `mcp-imaudio/src/rpc/rpc-client.ts`
- Test: `mcp-imaudio/tests/unit/rpc-client.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `Executor`/`RpcError`/`RpcResult`；Task 2 的 `execute`（默认注入）。
- Produces: `rpcCall(op, args, config, executor?, opts?)` → `Promise<unknown>`（Task 5 用）。

- [ ] **Step 1: 写失败测试**

创建 `mcp-imaudio/tests/unit/rpc-client.test.ts`：
```typescript
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
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/rpc-client.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 rpc-client.ts**

创建 `mcp-imaudio/src/rpc/rpc-client.ts`：
```typescript
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
```

- [ ] **Step 4: 运行确认通过**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/rpc-client.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: 类型检查**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 6: 检查点**

---

## Task 5: yunos-adapter soundstage → rpcCall（TDD）

**Files:**
- Modify: `mcp-imaudio/src/adapters/yunos-adapter.ts`（readSoundStage:14-16, setSoundStage:19-21；加 import）
- Test: `mcp-imaudio/tests/unit/yunos-adapter-soundstage.test.ts`

**Interfaces:**
- Consumes: Task 4 的 `rpcCall`；现有 `SoundstageReadResult`/`SoundstageSetResult`（types.ts）。
- Produces: `createYunosAdapter(cfg).readSoundStage()`/`.setSoundStage(...)` 返回真实 DTO（不再 throw）。

- [ ] **Step 1: 写失败测试（用 dependency-injection，避免 spy 拦截问题）**

> 决策：yunos-adapter 改为接受可选 `rpcFn` 参数（默认 `rpcCall`），测试注入 mock。比 `vi.spyOn` 拦截模块导出更稳。

创建 `mcp-imaudio/tests/unit/yunos-adapter-soundstage.test.ts`：
```typescript
import { describe, it, expect, vi } from "vitest";
import { createYunosAdapter } from "../../src/adapters/yunos-adapter.js";
import type { AdbConfig } from "../../src/config.js";

const CFG: AdbConfig = { path: "adb", use_host: true, timeout_ms: 10000 };

describe("yunos-adapter soundstage via rpc", () => {
  it("readSoundStage maps rpc data to SoundstageReadResult", async () => {
    const rpcFn = vi.fn().mockResolvedValue({ mode: "all", fade: 1, balance: 2 });
    const a = createYunosAdapter(CFG, rpcFn);
    const r = await a.readSoundStage();
    expect(r.success).toBe(true);
    expect(r.mode).toBe("all");
    expect(r.fade).toBe(1);
    expect(r.balance).toBe(2);
    expect(r.vncEnabled).toBe(false);
    expect(r.isAtmosPlaying).toBe(false);
    expect(rpcFn).toHaveBeenCalledWith("soundstage.read", {}, CFG);
  });

  it("setSoundStage calls rpc and echoes back", async () => {
    const rpcFn = vi.fn().mockResolvedValue({});
    const a = createYunosAdapter(CFG, rpcFn);
    const r = await a.setSoundStage(1, 0, 0);
    expect(r.success).toBe(true);
    expect(r.mode).toBe("1");
    expect(r.fade).toBe(0);
    expect(r.balance).toBe(0);
    expect(rpcFn).toHaveBeenCalledWith("soundstage.set", { mode: 1, fade: 0, balance: 0 }, CFG);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/yunos-adapter-soundstage.test.ts`
Expected: FAIL（当前方法 throw "not implemented"；且 createYunosAdapter 不接受第二参数——TS 报错或运行时忽略）

- [ ] **Step 3: 改 yunos-adapter.ts**

在 `mcp-imaudio/src/adapters/yunos-adapter.ts`：
1) 顶部 import 区（line 2 后）加：
```typescript
import { rpcCall as defaultRpcCall } from "../rpc/rpc-client.js";
import type { AdbConfig } from "../config.js";
```
> 注：line 2 已有 `import type { AdbConfig } from "../config.js";`，若已存在则不重复加；只加 rpcCall 行。
2) 改 `createYunosAdapter` 签名（line 9），加可选 `rpcFn` 参数：
```typescript
export function createYunosAdapter(
  adbConfig: AdbConfig,
  rpcFn: (op: string, args: unknown, config: AdbConfig) => Promise<unknown> = defaultRpcCall,
): IAdapter {
```
3) 替换 `readSoundStage`（当前 14-16）：
```typescript
    async readSoundStage(): Promise<SoundstageReadResult> {
      const d = (await rpcFn("soundstage.read", {}, adbConfig)) as { mode?: string; fade?: number; balance?: number };
      return {
        success: true,
        mode: String(d.mode ?? ""),
        fade: Number(d.fade ?? 0),
        balance: Number(d.balance ?? 0),
        vncEnabled: false,       // Phase 1：未组合（Phase 2 加 vnc.read 组合）
        isAtmosPlaying: false,   // Phase 1：未组合（Phase 2 加 isAtmosPlaying 组合）
      } as SoundstageReadResult;
    },
```
4) 替换 `setSoundStage`（当前 19-21）：
```typescript
    async setSoundStage(mode: number, fade?: number, balance?: number): Promise<SoundstageSetResult> {
      await rpcFn("soundstage.set", { mode, fade, balance }, adbConfig);
      return {
        success: true,
        mode: String(mode),
        fade: Number(fade ?? 0),
        balance: Number(balance ?? 0),
      } as SoundstageSetResult;
    },
```
> 其余方法（launchApp 等）保持不变。`launchApp` 仍用现有 `execute("sendlink", ...)`，不受影响。

- [ ] **Step 4: 运行确认通过**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/yunos-adapter-soundstage.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 5: 全量类型检查 + build**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx tsc --noEmit && npm run build`
Expected: 零错误，dist/ 更新

- [ ] **Step 6: 全量单测（除设备相关）**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run 2>&1 | tail -15`
Expected: 新增 3 个测试文件全 PASS；既有测试不回归（"sendlink command resolves against real device" 设备离线时失败，属 Task 8 范畴，不计回归；yunos-adapter-launch 测试用 `createYunosAdapter(STUB_CONFIG)` 单参仍兼容，因 rpcFn 有默认值）。

- [ ] **Step 7: 检查点**

---

## Task 6: imaudio soundstage 配置 + 用参考引擎验证

**Files:**
- Create: `imaudio_app_code/rpc/config.json`（交付物，推到 `/sdcard/imrpc/config.json`）
- Verify: 用 Task 3 的 `constructDbusCall` 跑一遍，确认产出的 argString 与 `AudioPolicyProxy.ts` 的 wire 格式一致。

**Interfaces:**
- Produces: `config.json` 含 `soundstage.read`/`soundstage.set` 两条 dbus 规格（精确值来自 `AudioPolicyProxy.ts:10-11,35-88`）。

- [ ] **Step 1: 写 config.json**

创建 `imaudio_app_code/rpc/config.json`：
```json
{
  "soundstage.read": {
    "type": "dbus",
    "bus": "com.yunos.audiopolicyservice",
    "path": "/com/yunos/audiopolicyservice",
    "method": "request",
    "arg": { "funcName": "audiopolicyservice.yunos.com/baseModeules/requstGetSoundEffectsMode" },
    "reply": "json"
  },
  "soundstage.set": {
    "type": "dbus",
    "bus": "com.yunos.audiopolicyservice",
    "path": "/com/yunos/audiopolicyservice",
    "method": "request",
    "arg": {
      "funcName": "audiopolicyservice.yunos.com/baseModeules/requstSetSoundEffectsMode",
      "data": { "mode": "${mode}", "fade": "${fade}", "balance": "${balance}" }
    },
    "stringify": ["data"],
    "reply": "json"
  }
}
```

- [ ] **Step 2: 用参考引擎验证 set 的 wire 格式**

前置：Task 5 Step 5 已 `npm run build`（dist 含 rpc-engine）。Run：
```bash
cd D:/IM/im-mcp-codeagent/mcp-imaudio && node -e "
const { constructDbusCall } = require('./dist/rpc/rpc-engine.js');
const cfg = require('D:/IM/imaudio_app_code/rpc/config.json');
const c = constructDbusCall(cfg['soundstage.set'], { mode: 1, fade: 0, balance: 0 });
const arg = JSON.parse(c.argString);
console.log('data is string:', typeof arg.data === 'string');
console.log('data parsed:', JSON.parse(arg.data));
console.log('matches proxy wire:', JSON.parse(arg.data).mode === 1 && arg.funcName.includes('requstSetSoundEffectsMode'));
"
```
Expected: `data is string: true`；`data parsed: {mode:1,fade:0,balance:0}`；`matches proxy wire: true`。
> 这对照 `AudioPolicyProxy.setSoundStage` 的 `params = {funcName, data: JSON.stringify({mode,fade,balance})}`，确认 config + 引擎产出的 wire 与 app 自身调用完全一致。

- [ ] **Step 3: JSON 合法性**

Run: `node -e "JSON.parse(require('fs').readFileSync('D:/IM/imaudio_app_code/rpc/config.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 4: 检查点**

---

## Task 7: 车机通用 RpcEngine.ts（TS/agil）+ manifest page 项

**Files:**
- Create: `imaudio_app_code/ts/RpcEngine.ts`（通用引擎，**镜像 Task 3 的 dispatch 算法**，翻译成 agil/TS；交同事构建，不本地跑测）
- Modify: `imaudio_app_code/manifest.json`（pages 数组追加 rpcagent 项）

**验证方式**：对照 Task 3（Node 参考，有测）+ `AudioPolicyProxy.ts`/`BaseProxy.ts`（ubus 用法）+ `utils/EqualizerConfigStore.ts`（File 用法）review。**不本地跑测**（agil 运行时不在本机）。

- [ ] **Step 1: 写 RpcEngine.ts**

创建 `imaudio_app_code/ts/RpcEngine.ts`：
```typescript
"use strict";
/**
 * 通用 RPC 引擎页（所有 app 相同）。镜像 mcp-imaudio/src/rpc/rpc-engine.ts 的 dispatch 算法。
 * 以 system uid 运行：读 /sdcard/imrpc/{config,cmd}.json → 按 config dispatch(dbus|native) → 写 result.json → 自销毁。
 * 不 import 任何 app 业务代码；靠 config 驱动。
 */
import { BMPage } from "extend/hdt/page/BMPage";
import UBus = require("ubus");
import { File, FileReader, FileWriter } from "yunos/cloudfs/File";
import Log = require("./utils/Log");

const TAG = "RpcEngine::";
const CONFIG_PATH = "/sdcard/imrpc/config.json";
const CMD_PATH = "/sdcard/imrpc/cmd.json";
const RESULT_PATH = "/sdcard/imrpc/result.json";

// ---- dispatch 算法（镜像 rpc-engine.ts）----
function interpolate(template: any, vars: Record<string, any>): any {
  if (typeof template === "string")
    return template.replace(/\$\{(\w+)\}/g, (_m, k) => (vars[k] === undefined ? "" : String(vars[k])));
  if (Array.isArray(template)) return template.map((v) => interpolate(v, vars));
  if (template && typeof template === "object") {
    const o: any = {};
    for (const k of Object.keys(template)) o[k] = interpolate(template[k], vars);
    return o;
  }
  return template;
}
function applyStringify(arg: any, paths: string[] = []): void {
  for (const p of paths) {
    const segs = p.split(".");
    let node: any = arg;
    for (let i = 0; i < segs.length - 1; i++) node = node[segs[i]];
    node[segs[segs.length - 1]] = JSON.stringify(node[segs[segs.length - 1]]);
  }
}
function evalExpr(expr: string, vars: Record<string, any>): any {
  const s = expr.replace(/\$\{(\w+)\}/g, (_m, k) => String(vars[k] ?? 0));
  if (!/^[-+*/().\s\d]+$/.test(s)) throw new Error("bad expr: " + expr);
  return Function('"use strict"; return (' + s + ");")();
}

class RpcEngine extends BMPage {
  onStart() {
    this.run()
      .catch((e: any) => Log.E(TAG, "run error", e))
      .then(() => { try { (this as any).finish(); } catch (e) { Log.W(TAG, "finish unavailable", e); } });
  }

  private async run(): Promise<void> {
    let cmd: any;
    try {
      cmd = JSON.parse(await readFile(CMD_PATH));
    } catch (e) {
      await writeResult({ reqId: "", ok: false, error: { code: "BAD_ARGS", message: "cmd unreadable" } });
      return;
    }
    const reqId = cmd.reqId;
    let cfg: any;
    try {
      cfg = JSON.parse(await readFile(CONFIG_PATH));
    } catch (e) {
      await writeResult({ reqId, ok: false, error: { code: "BAD_ARGS", message: "config unreadable" } });
      return;
    }
    const spec = cfg[cmd.op];
    if (!spec) { await writeResult({ reqId, ok: false, error: { code: "UNKNOWN_OP", message: cmd.op } }); return; }
    try {
      const data = spec.type === "dbus" ? await this.callDbus(spec, cmd.args || {})
                : spec.type === "native" ? await this.callNative(spec, cmd.args || {})
                : Promise.reject(new Error("bad type"));
      await writeResult({ reqId, ok: true, data });
    } catch (e) {
      await writeResult({ reqId, ok: false, error: { code: "RPC_ERROR", message: String(e) } });
    }
  }

  private callDbus(spec: any, args: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const arg = interpolate(JSON.parse(JSON.stringify(spec.arg)), args);
      applyStringify(arg, spec.stringify || []);
      const ubus = new UBus("dbus");
      const iface = ubus.createInterface(spec.bus, spec.path, spec.bus);
      const msg = iface.createMethodCallMessage(spec.method);
      msg.writeString(JSON.stringify(arg));
      iface.sendMethodCallMessage(msg, (err: any, result: any) => {
        if (err) { reject(err); return; }
        try {
          let data: any;
          switch (spec.reply) {
            case "json": data = result.readJSON(); break;
            case "string": data = result.readString(); break;
            case "int": data = result.readInt32(); break;
            case "double": data = result.readDouble(); break;
            case "bool": data = result.readBool(); break;
            default: data = result.readJSON();
          }
          resolve(data);
        } catch (e) { reject(e); }
        finally { try { result.destroy(); } catch (_) {}
                 try { iface.destroy(); } catch (_) {} }
      });
    });
  }

  private async callNative(spec: any, args: Record<string, any>): Promise<any> {
    const M: any = require(spec.require);
    const inst = spec.factory ? M[spec.factory]() : new M();
    const resolved = (spec.args || []).map((a: any) => {
      if (typeof a === "string") return interpolate(a, args);
      if (a && typeof a === "object" && typeof a.expr === "string") return evalExpr(a.expr, args);
      return a;
    });
    return await inst[spec.method](...resolved);
  }
}

// ---- File 读写（参考 utils/EqualizerConfigStore.ts 的 yunos/cloudfs 用法）----
function readFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const f = new File(path);
    const r = new FileReader(f);
    r.onloadend = () => resolve(r.result || "");
    r.onerror = (e: any) => reject(e);
    r.readAsText(f);
  });
}
function writeResult(obj: any): Promise<void> {
  return new Promise((resolve) => {
    const f = new File(RESULT_PATH);
    const w = new FileWriter(f);
    w.onwriteend = () => resolve();
    w.onerror = () => resolve(); // 尽力写，不阻塞自销毁
    w.write(JSON.stringify(obj));
  });
}

export = RpcEngine;
```
> **review 要点**（实现时对照源码确认，必要时调整）：
> - ubus 用法对照 `ts/proxy/BaseProxy.ts:2,30-43`（`new UBus("dbus")`、`createInterface`、`createMethodCallMessage`、`writeString`、`sendMethodCallMessage`、`readJSON`、`destroy`）。`createInterface` 的第三参数（interface 名）以 BaseProxy 为准（此处用 bus 名占位）。
> - File 用法对照 `ts/utils/EqualizerConfigStore.ts`——若该文件实际 API（FileReader/FileWriter 的回调名、readAsText 等）与上面有出入，**以 EqualizerConfigStore.ts 为准**调整 readFile/writeResult。
> - `finish()`：BMPage 是否有主动关闭页 API 以源码为准；若无则该 try/catch 安全降级（页面干完即止）。

- [ ] **Step 2: manifest.json 加 page 项**

在 `imaudio_app_code/manifest.json` 的 `pages` 数组——把最后一个 page（showroomaudio，当前以 `}` 结尾、数组以 `]` 结尾）改为追加 rpcagent 项：
```json
    }, {
      "uri": "page://imaudio.yunos.com/rpcagent",
      "content_path": "src/RpcEngine.js",
      "main": false,
      "capabilities": { "ui": { "engine": "agil", "display": "disp_host0" } },
      "extension": {}
    }]
```
（即 showroomaudio 的 `}` 后接 `, { ...rpcagent... }`，再 `]` 闭合数组。）

- [ ] **Step 3: review 自检（不本地跑测）**

对照确认（读源码核对，按需修正 RpcEngine.ts）：
- dispatch 算法与 `mcp-imaudio/src/rpc/rpc-engine.ts`（Task 3，有测）一致。
- ubus/File 用法与 `ts/proxy/BaseProxy.ts`、`ts/utils/EqualizerConfigStore.ts` 一致。
- manifest.json JSON 合法。

Run: `node -e "JSON.parse(require('fs').readFileSync('D:/IM/imaudio_app_code/manifest.json','utf8')); console.log('manifest valid')"`
Expected: `manifest valid`

- [ ] **Step 4: 交付检查点**

本 task 产出**交同事**构建装车（Option B）：`ts/RpcEngine.ts` + manifest page 项 + `rpc/config.json`。同事 merge → AliOS 构建（system 签名）→ installYpp 装车。装车后进入 Task 8。

---

## Task 8: 真机桥测试（同事装车后 + 设备在线）

**Files:** 无（运行验证）

- [ ] **Step 1: 确认设备在线 + 同事已装车**

Run: `D:/IM/im-mcp-codeagent/tools/adb/adb.exe -host shell getprop ro.product.model`
Expected: 返回型号（如 EP33L），非 "device not found"。同事确认 rpcagent 页已打进 imaudio 并装车。

- [ ] **Step 2: 推 config + 建目录**

Run:
```bash
D:/IM/im-mcp-codeagent/tools/adb/adb.exe -host shell "mkdir -p /sdcard/imrpc"
D:/IM/im-mcp-codeagent/tools/adb/adb.exe -host push D:/IM/imaudio_app_code/rpc/config.json /sdcard/imrpc/config.json
D:/IM/im-mcp-codeagent/tools/adb/adb.exe -host shell "cat /sdcard/imrpc/config.json"
```
Expected: cat 回显 config.json 内容（推送成功）。

- [ ] **Step 3: 手动一次 soundstage.read 桥往返（验文件权限 + sendlink 拉起 + 引擎 dispatch）**

Run:
```bash
A="D:/IM/im-mcp-codeagent/tools/adb/adb.exe -host shell"
$A "printf '%s' '{\"reqId\":\"manual-1\",\"op\":\"soundstage.read\",\"args\":{}}' > /sdcard/imrpc/cmd.json"
$A "sendlink page://imaudio.yunos.com/rpcagent"
sleep 1
$A "cat /sdcard/imrpc/result.json"; echo
```
Expected: result.json 含 `{"reqId":"manual-1","ok":true,"data":{...status,result...}}`（真实声场）或 `ok:false`+error。
> 若 `ok:false`/超时：按 spec §12 排查——文件权限（root 写 / system 读 `/sdcard/imrpc`）、sendlink 是否拉起 rpcagent、引擎 `finish()`/File API、native/dbus 调用细节。此时可只推 config 微调 + 重测（不重构建）。

- [ ] **Step 4: e2e 端到端（PC MCP → rpc → 真机）**

确认 `mcp-imaudio/conf/config.yaml` 的 `adapter.mock_mode: false`。然后：
```bash
cd D:/IM/im-mcp-codeagent/e2e-test-runner
echo "read the current soundstage" | "D:/ZZT/z-aip/.venv/Scripts/python.exe" interactive.py
```
Expected: LLM 调 `soundstage_read` → 返回真实 `{mode,fade,balance,...}`；用户确认车机声场状态。
> 中文输入经管道有编码问题（已知），用英文 prompt 测；交互式手敲中文应正常。

- [ ] **Step 5: e2e soundstage.set + 回归**

```bash
echo "set soundstage to all speakers mode" | "D:/ZZT/z-aip/.venv/Scripts/python.exe" interactive.py
```
Expected: LLM 调 `soundstage_set` → success；用户确认车机声场切换。回归 `launch_app("imaudio")` 不破坏（方向1 不受影响）。

- [ ] **Step 6: 用户确认实机反应 + Phase 1 完成检查点**

---

## Self-Review

**1. Spec 覆盖（spec §2 五条 + §5/§6/§7/§8/§10）**：
- 桥=file/sendlink（Task 4 rpc-client + Task 2 shell + Task 7 sendlink 触发）✓
- 自销毁（Task 7 RpcEngine `onStart→run→finish`）✓
- Option B（Task 7 产出交同事，不本地构建；Task 8 同事装车后测）✓
- 数据驱动 dispatch（Task 3 engine 算法 + Task 6 config + Task 7 通用页）✓
- e2e/tool/schema 不变（Task 5 只改 adapter 底层）✓
- soundstage read/set（Task 5 adapter + Task 6 config + Task 8 e2e）✓
- mock 是主力验证（Task 3/4/5 PC 全 TDD，Task 7 靠 Task 3 参考镜像）✓
- Phase 1 验收（Task 8 soundstage 真机端到端）✓
- Phase 2 明确不做（仅 soundstage，其余 op 后续计划）✓

**2. Placeholder 扫描**：无 TBD/TODO。所有 code step 含真实代码（基于读到的精确当前实现：adb-executor.ts、yunos-adapter.ts、types.ts、AudioPolicyProxy.ts、SoundStageManager.ts、config.ts）。Task 7 RpcEngine.ts 的 File/ubus API 标注"以 BaseProxy.ts/EqualizerConfigStore.ts 为准"——这是诚实的 review 指引（实现时核对），非 placeholder。

**3. 类型一致性**：
- `rpcCall(op, args, config, executor?, opts?)` → Task 4 定义，Task 5 经 `rpcFn` 调用一致（`rpcFn("soundstage.read", {}, adbConfig)` / `rpcFn("soundstage.set", {mode,fade,balance}, adbConfig)`）；Task 5 的 `rpcFn` 默认值 `defaultRpcCall` 即 Task 4 的 `rpcCall` ✓
- `constructDbusCall(spec, args)` → Task 3 定义，Task 6 验证调用一致 ✓
- `RpcError(code,message)` → Task 1 定义，Task 4 抛出、Task 5 经 adapter catch 走 formatError ✓
- `SoundstageReadResult{success,mode:string,fade,balance,vncEnabled,isAtmosPlaying}` / `SoundstageSetResult{success,mode:string,fade,balance}` → types.ts 精确字段，Task 5 映射一致（mode 转 String）✓
- config 的 op key（`soundstage.read`/`soundstage.set`）与 Task 5 rpcCall 的 op 字符串、Task 6 config 的 key、Task 7 引擎 dispatch 的 lookup 四处一致 ✓
- `createYunosAdapter(adbConfig, rpcFn?)` 第二参数有默认值 → 既有 `createYunosAdapter(STUB_CONFIG)` 单参调用（yunos-adapter-launch 测试）仍兼容 ✓
