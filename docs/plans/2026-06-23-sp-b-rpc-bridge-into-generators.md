# SP-B：RPC 桥并入生成器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Phase-1 验证的 rpc 桥泛化进 im-mcp-codeagent 插件的 CLI 生成器 + 方法论，让生成的 server 经桥真实控车（不再 throw），全流程 app 无关，config 确定性可靠。

**Architecture:** Phase-1 的 dispatch 核心算法（constructDbusCall/constructNativeCall）下沉进共享 `framework/` 包，CLI 校验与生成 server 运行时共用（DRY，避免分歧）。新增确定性生成器（rpc-bridge / yunos-adapter-rpc / car-rpc-engine）从 analysis.json 产桥；新增确定性闸门命令（validate-config / wire-check）；mcp-generate skill 方法论指导宿主 agent 产 config.json。插件内零 LLM call。

**Tech Stack:** TypeScript (CLI: vitest + tsc；framework 包；生成产物 server: tsc)。插件 = skills（方法论）+ CLI（确定性）+ framework（运行时）+ 资产。

**Spec:** `D:\IM\im-mcp-codeagent\docs\specs\2026-06-23-sp-b-rpc-bridge-into-generators-design.md`

## Global Constraints（spec §0/§2/§6，所有 task 隐含）

- **插件内零 LLM call**：生成由宿主 agent（Claude Code/Codex）按 skill 方法论执行；CLI/framework 纯确定性。
- **判断面最小**：除 `config.json`（宿主 agent 产）外，一切确定性生成器产出。
- **app 无关**：生成器零 app 字面量（`grep -i "imaudio|soundstage" cli/src/generators/` 必须无匹配）；按 `analysis.app.name`/`capabilities` 参数化。
- **adapter 按名映射 + 缺省**：DTO 字段取 `returns.fields`，运行时 `data[f] ?? default`（不需生成期知道响应形状）。
- **闸门 sample-args** 从 `cap.params` 按类型合成（number→1、string→"x"、boolean→true、enum→首值、optional→omit）。
- 项目非 git：commit 步骤作验证检查点。CLI 测试：vitest，`cli/tests/*.test.ts`，测纯 helper（`expect(code).toContain`）。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `framework/src/rpc-spec.ts` | dispatch 核心（constructDbusCall/constructNativeCall + 类型），CLI 与 server 共用 | 新建 |
| `framework/src/index.ts` | 导出 rpc-spec | 修改（加导出） |
| `cli/src/generators/rpc-bridge.ts` | 产 server 的 rpc-types/rpc-engine/rpc-client/adb-executor | 新建 |
| `cli/src/generators/yunos-adapter-rpc.ts` | 产 yunos-adapter（rpcCall+按名映射DTO+缺省），替换 stub | 新建 |
| `cli/src/generators/car-rpc-engine.ts` | 产车机 RpcEngine.ts + manifest-page.json 交付物 | 新建 |
| `cli/src/commands/scaffold.ts` | 接入新生成器 + 改 generateConfigTs(AdbConfig)/generateConfigYaml(adb块) | 修改 |
| `cli/src/commands/validate-config.ts` | 闸门：schema+覆盖率+dispatchable | 新建 |
| `cli/src/commands/wire-check.ts` | 闸门：proxy 共用模式→对比 constructDbusCall | 新建 |
| `cli/src/cli.ts` | 注册 validate-config/wire-check | 修改 |
| `cli/src/state/manager.ts` | StepName 加 validate_config/wire_check | 修改 |
| `skills/mcp-generate/SKILL.md` | 移除 throw 桩→config 抽取方法论 | 修改 |
| `skills/mcp-pipeline/SKILL.md` | 加 config 步+闸门编排 | 修改 |
| 测试：`framework/tests/rpc-spec.test.ts`、`cli/tests/{rpc-bridge,yunos-adapter-rpc,car-rpc-engine,validate-config,wire-check}.test.ts` | | 新建 |

**模板源**（Phase-1，已存在于仓库，生成器嵌入/参照，去硬编码）：
- `mcp-imaudio/src/rpc/{rpc-types,rpc-engine,rpc-client}.ts`、`mcp-imaudio/src/executors/adb-executor.ts`
- `imaudio_app_code/ts/RpcEngine.ts`（车机引擎模板）、`imaudio_app_code/rpc/config.json`（config 范例）

---

## Task 1: framework rpc-spec 模块（dispatch 核心，CLI+server 共用）

**Files:**
- Create: `framework/src/rpc-spec.ts`
- Modify: `framework/src/index.ts`（加导出）
- Test: `framework/tests/rpc-spec.test.ts`

**Interfaces:**
- Produces: `RpcConfig`、`DbusSpec`、`NativeSpec`、`DbusCall`、`NativeCall` 类型；`constructDbusCall(spec, args)`、`constructNativeCall(spec, args)` 函数。后续 task（rpc-bridge 生成器、validate-config）从 `@im/mcp-server-framework` 导入。

- [ ] **Step 1: 写失败测试**

创建 `framework/tests/rpc-spec.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { constructDbusCall, constructNativeCall } from "../src/rpc-spec.js";
import type { DbusSpec, NativeSpec } from "../src/rpc-spec.js";

describe("constructDbusCall", () => {
  it("interpolates ${vars} (type-preserving) and stringifies listed paths", () => {
    const spec: DbusSpec = {
      type: "dbus", bus: "com.yunos.audiopolicyservice", path: "/com/yunos/audiopolicyservice",
      method: "request",
      arg: { funcName: "setMode", data: { mode: "${mode}", fade: "${fade}" } },
      stringify: ["data"], reply: "json",
    };
    const call = constructDbusCall(spec, { mode: 1, fade: 0 });
    const arg = JSON.parse(call.argString);
    expect(typeof arg.data).toBe("string");
    expect(JSON.parse(arg.data)).toEqual({ mode: 1, fade: 0 }); // number preserved
  });
});

describe("constructNativeCall", () => {
  it("resolves ${var} (type-preserving) and expr transforms", () => {
    const spec: NativeSpec = {
      type: "native", require: "yunos/device/AudioManager", factory: "getInstance",
      method: "setEQ", args: ["${band}", { expr: "${level} + 7" }],
    };
    const call = constructNativeCall(spec, { band: 3, level: 2 });
    expect(call.args).toEqual([3, 9]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/framework && npx vitest run tests/rpc-spec.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 rpc-spec.ts**

创建 `framework/src/rpc-spec.ts`——内容 = `mcp-imaudio/src/rpc/rpc-engine.ts` 的 dispatch 部分（`DbusSpec`/`NativeSpec`/`RpcSpec`/`RpcConfig` 类型 + `interpolate`/`applyStringify`/`evalExpr`/`constructDbusCall`/`constructNativeCall`），**逐字搬过来**（含 type-preserving 的 single-placeholder 修正）。即把 `mcp-imaudio/src/rpc/rpc-engine.ts` 全文复制为 `framework/src/rpc-spec.ts`（无需改动——它本就是纯算法模块）。

- [ ] **Step 4: framework/src/index.ts 加导出**

在 `framework/src/index.ts` 末尾加：
```typescript
export * from "./rpc-spec.js";
```

- [ ] **Step 5: 运行确认通过 + framework build**

Run: `cd D:/IM/im-mcp-codeagent/framework && npx vitest run tests/rpc-spec.test.ts && npm run build`
Expected: PASS（2 tests）；build 无错

- [ ] **Step 6: 检查点**

---

## Task 2: rpc-bridge 生成器（产 server rpc 基础设施）

**Files:**
- Create: `cli/src/generators/rpc-bridge.ts`
- Test: `cli/tests/rpc-bridge.test.ts`

**Interfaces:**
- Consumes: `AnalysisData`（用 `analysis.app.name`）。
- Produces: `generateRpcBridge(analysis): Map<string, string>`——key 为 `src/rpc/rpc-types.ts`、`src/rpc/rpc-engine.ts`、`src/rpc/rpc-client.ts`、`src/executors/adb-executor.ts`。

- [ ] **Step 1: 写失败测试**

创建 `cli/tests/rpc-bridge.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { generateRpcBridge } from "../src/generators/rpc-bridge.js";

const SAMPLE = {
  app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" },
  capabilities: [
    { id: "read_status", domain: "vehicle", object: "gear", action: "read_status",
      safetyLevel: "readonly", sdkCalls: ["@system.vehicle"], sourceRef: "src/s.ts:read" },
  ],
};

describe("generateRpcBridge", () => {
  it("emits 4 bridge files", () => {
    const files = generateRpcBridge(SAMPLE);
    expect(files.get("src/rpc/rpc-types.ts")).toBeTruthy();
    expect(files.get("src/rpc/rpc-engine.ts")).toBeTruthy();
    expect(files.get("src/rpc/rpc-client.ts")).toBeTruthy();
    expect(files.get("src/executors/adb-executor.ts")).toBeTruthy();
  });

  it("parametrizes rpc-client RPC_URL by app name (no imaudio literal)", () => {
    const files = generateRpcBridge(SAMPLE);
    const client = files.get("src/rpc/rpc-client.ts")!;
    expect(client).toContain("page://testapp.yunos.com/rpcagent");
    expect(client).not.toContain("imaudio");
  });

  it("rpc-engine re-exports dispatch from framework (DRY)", () => {
    const files = generateRpcBridge(SAMPLE);
    const engine = files.get("src/rpc/rpc-engine.ts")!;
    expect(engine).toContain("@im/mcp-server-framework");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/rpc-bridge.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 rpc-bridge.ts**

创建 `cli/src/generators/rpc-bridge.ts`：
```typescript
import type { AnalysisData } from "../types.js";

/** rpc-types.ts：与 mcp-imaudio/src/rpc/rpc-types.ts 逐字相同（通用，无参数化）。 */
const RPC_TYPES = `import type { ExecResult } from "../executors/adb-executor.js";
import type { AdbConfig } from "../config.js";

export interface RpcCmd { readonly reqId: string; readonly op: string; readonly args: unknown; }
export interface RpcResult { readonly reqId: string; readonly ok: boolean; readonly data?: unknown; readonly error?: { readonly code: string; readonly message: string }; }
export class RpcError extends Error { readonly code: string; constructor(code: string, message: string) { super(message); this.name = "RpcError"; this.code = code; } }
export type Executor = (commandName: string, args: Record<string, unknown>, config: AdbConfig) => Promise<ExecResult>;
`;

/** rpc-engine.ts：薄封装，从 framework 复用 dispatch 核心（DRY）。 */
function rpcEngine(): string {
  return `// dispatch 核心来自 @im/mcp-server-framework（rpc-spec），本文件为 server 运行时入口。
export {
  constructDbusCall, constructNativeCall,
  type RpcConfig, type DbusSpec, type NativeSpec, type RpcSpec,
} from "@im/mcp-server-framework";
`;
}

/** rpc-client.ts：RPC_URL 按 app.name 参数化（去硬编码）。 */
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

/** adb-executor.ts：与 mcp-imaudio/src/executors/adb-executor.ts 逐字相同（通用，含 sendlink+shell 注册）。 */
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
```
> 注：rpc-client 的 RPC_URL 用 `appName`（`testapp`→`page://testapp.yunos.com/rpcagent`）。adb-executor/rpc-types 与 Phase-1 逐字一致（通用）。

- [ ] **Step 4: 运行确认通过 + tsc**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/rpc-bridge.test.ts && npx tsc --noEmit`
Expected: PASS（3 tests）；tsc 零错

- [ ] **Step 5: 检查点**

---

## Task 3: 配置生成——config.ts 加 AdbConfig + config.yaml 加 adb 块

**Files:**
- Modify: `cli/src/commands/scaffold.ts`（`generateConfigTs` + `generateConfigYaml`）
- Test: `cli/tests/scaffold.test.ts`（追加断言）

**Interfaces:**
- Produces：生成的 `src/config.ts` 含 `AdbConfig` 接口 + adb path 解析；`conf/config.yaml` 含 `adb:` 块。rpc-client/adb-executor 依赖 `AdbConfig`（从 `../config.js` 导入）。

- [ ] **Step 1: 写失败测试（追加到 scaffold.test.ts 的现有用例或新 it）**

在 `cli/tests/scaffold.test.ts` 的 `describe("scaffoldProject", ...)` 内追加：
```typescript
  it("config.ts contains AdbConfig and config.yaml contains adb block", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);
    const configTs = readFileSync(resolve(OUTPUT_DIR, "src/config.ts"), "utf-8");
    expect(configTs).toContain("interface AdbConfig");
    expect(configTs).toContain("use_host");
    const configYaml = readFileSync(resolve(OUTPUT_DIR, "conf/config.yaml"), "utf-8");
    expect(configYaml).toContain("adb:");
    expect(configYaml).toContain("use_host: true");
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/scaffold.test.ts`
Expected: FAIL（`interface AdbConfig` / `adb:` 不存在）

- [ ] **Step 3: 改 generateConfigTs（加 AdbConfig + adb 解析）**

读 `mcp-imaudio/src/config.ts`（Phase-1，含 `AdbConfig` 接口 + adb path 解析逻辑），把 `AdbConfig` 接口与 adb 字段解析并入 `cli/src/commands/scaffold.ts` 的 `generateConfigTs` 返回模板（在现有 `ServerConfig` 之外加 `AdbConfig` + `ServerConfig` 加 `adb?: AdbConfig` 字段 + loadConfig 解析 adb 块、path 相对 conf/ 解析为绝对）。去 imaudio 字面量。

- [ ] **Step 4: 改 generateConfigYaml（加 adb 块）**

在 `cli/src/commands/scaffold.ts:116-136 generateConfigYaml` 的返回模板里，`adapter:` 块后追加 adb 块：
```yaml
adb:
  path: "../../tools/adb/adb.exe"
  use_host: true
  timeout_ms: 10000
```
（即在模板字符串里加 `adb:\\n  path: "../../tools/adb/adb.exe"\\n  use_host: true\\n  timeout_ms: 10000\\n`。）

- [ ] **Step 5: 运行确认通过 + tsc**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/scaffold.test.ts && npx tsc --noEmit`
Expected: PASS（含新断言）；tsc 零错

- [ ] **Step 6: 检查点**

---

## Task 4: yunos-adapter-rpc 生成器（rpcCall + 按名映射 DTO + 缺省，替换 stub）

**Files:**
- Create: `cli/src/generators/yunos-adapter-rpc.ts`
- Modify: `cli/src/commands/scaffold.ts`（files 数组 yunos-adapter 项改用新生成器）
- Test: `cli/tests/yunos-adapter-rpc.test.ts`

**Interfaces:**
- Consumes: `AnalysisData`（`capabilities[].id/params/returns.fields`）、`buildMethodMap`/`tsType`/`safeFieldName`/`toDtoName`（from `adapter-types.ts`）。
- Produces: `generateYunosAdapterRpc(analysis): string`——每方法 `await rpcFn("<cap.id>", {<params>}, adbConfig)` + 按名映射 DTO（`returns.fields` → `data[f] ?? default`）。

- [ ] **Step 1: 写失败测试**

创建 `cli/tests/yunos-adapter-rpc.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { generateYunosAdapterRpc } from "../src/generators/yunos-adapter-rpc.js";

const SAMPLE = {
  app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" },
  capabilities: [
    { id: "soundstage_read", domain: "soundstage", object: "sound_stage", action: "read",
      returns: { type: "SoundstageReadResult", fields: ["success", "mode", "fade", "balance", "vncEnabled"] },
      safetyLevel: "readonly", sdkCalls: ["SoundStageManager.getSoundStage"], sourceRef: "ts/m.ts:get" },
    { id: "soundstage_set", domain: "soundstage", object: "sound_stage", action: "set",
      params: [{ name: "mode", type: "number" }, { name: "fade", type: "number", optional: true }],
      returns: { type: "SoundstageSetResult", fields: ["success", "mode", "fade"] },
      safetyLevel: "normal", sdkCalls: ["SoundStageManager.setSoundStage"], sourceRef: "ts/m.ts:set" },
  ],
};

describe("generateYunosAdapterRpc", () => {
  it("emits rpcCall(op) per method (no throw)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain('rpcFn("soundstage_read"');
    expect(code).toContain('rpcFn("soundstage_set"');
    expect(code).not.toContain("not implemented");
  });
  it("maps DTO by name with defaults (returns.fields)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain("vncEnabled"); // 字段出现
    expect(code).toContain("defaultFor"); // 按名映射+缺省 helper
  });
  it("createYunosAdapter takes (adbConfig, rpcFn=defaultRpcCall)", () => {
    const code = generateYunosAdapterRpc(SAMPLE);
    expect(code).toContain("createYunosAdapter(adbConfig, rpcFn = defaultRpcCall)");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/yunos-adapter-rpc.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 yunos-adapter-rpc.ts**

创建 `cli/src/generators/yunos-adapter-rpc.ts`：
```typescript
import type { AnalysisData } from "../types.js";
import { buildMethodMap, tsType, safeFieldName, toDtoName } from "./adapter-types.js";

/** 生成按名映射 DTO 的对象字面量（returns.fields → data[f] ?? default）。 */
function mapDtoSnippet(fields: readonly string[]): string {
  if (fields.length === 0) return "{ success: true }";
  const entries = fields.map((f) => {
    if (f === "success") return `${f}: true`;
    return `${f}: (data as any)[${JSON.stringify(f)}] ?? defaultFor(${JSON.stringify(f)})`;
  }).join(", ");
  return `{ ${entries} }`;
}

export function generateYunosAdapterRpc(analysis: AnalysisData): string {
  const dtoNames = analysis.capabilities.filter((c) => c.returns).map((c) => toDtoName(c.id));
  const lines: string[] = [];
  lines.push('import { rpcCall as defaultRpcCall } from "../rpc/rpc-client.js";');
  lines.push("import type { AdbConfig } from \"../config.js\";");
  lines.push('import type { IAdapter' + (dtoNames.length ? ", " + dtoNames.join(", ") : "") + ' } from "./types.js";');
  lines.push("");
  lines.push("function defaultFor(field: string): unknown {");
  lines.push("  if (/enabled|active|playing/i.test(field)) return false;");
  lines.push("  return \"\";");
  lines.push("}");
  lines.push("");
  lines.push("export function createYunosAdapter(adbConfig: AdbConfig, rpcFn: (op: string, args: unknown, config: AdbConfig) => Promise<unknown> = defaultRpcCall): IAdapter {");
  lines.push("  return {");
  lines.push("    isMock: false,");
  const methodMap = buildMethodMap(analysis);
  for (const cap of analysis.capabilities) {
    const methodName = methodMap.get(cap.id)!;
    const params = (cap.params ?? []).map((p) => `${safeFieldName(p.name)}${p.optional ? "?" : ""}: ${tsType(p.type)}`).join(", ");
    const retType = cap.returns ? toDtoName(cap.id) : "unknown";
    const fields = (cap.returns?.fields ?? []).filter((f) => typeof f === "string") as string[];
    const argsObj = (cap.params ?? []).length ? `{ ${(cap.params ?? []).map((p) => safeFieldName(p.name)).join(", ")} }` : "{}";
    lines.push("");
    lines.push(`    async ${methodName}(${params}): Promise<${retType}> {`);
    lines.push(`      const data = await rpcFn(${JSON.stringify(cap.id)}, ${argsObj}, adbConfig);`);
    lines.push(`      return ${mapDtoSnippet(fields)} as ${retType};`);
    lines.push("    },");
  }
  lines.push("  };");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
```

- [ ] **Step 4: scaffold.ts 改用新生成器**

在 `cli/src/commands/scaffold.ts`：files 数组里 `{ path: "src/adapters/yunos-adapter.ts", content: generateYunosAdapterStub(analysis) }` 改为 `content: generateYunosAdapterRpc(analysis)`；顶部加 `import { generateYunosAdapterRpc } from "../generators/yunos-adapter-rpc.js";`。

- [ ] **Step 5: 运行确认通过 + tsc**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/yunos-adapter-rpc.test.ts tests/scaffold.test.ts && npx tsc --noEmit`
Expected: PASS；tsc 零错

- [ ] **Step 6: 检查点**

---

## Task 5: car-rpc-engine 生成器（车机交付物）

**Files:**
- Create: `cli/src/generators/car-rpc-engine.ts`
- Test: `cli/tests/car-rpc-engine.test.ts`

**Interfaces:**
- Consumes: `AnalysisData`（`app.name` → rpcagent page URI）。
- Produces: `generateCarRpcEngine(analysis): Map<string, string>`——`car-side/RpcEngine.ts`（通用 agil 引擎）+ `car-side/manifest-page.json`（`page://<name>.yunos.com/rpcagent` → `src/RpcEngine.js`）。

- [ ] **Step 1: 写失败测试**

创建 `cli/tests/car-rpc-engine.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { generateCarRpcEngine } from "../src/generators/car-rpc-engine.js";

const SAMPLE = { app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" }, capabilities: [] };

describe("generateCarRpcEngine", () => {
  it("emits RpcEngine.ts + manifest-page.json", () => {
    const f = generateCarRpcEngine(SAMPLE);
    expect(f.get("car-side/RpcEngine.ts")).toBeTruthy();
    expect(f.get("car-side/manifest-page.json")).toBeTruthy();
  });
  it("manifest page targets <name> domain", () => {
    const f = generateCarRpcEngine(SAMPLE);
    const mp = JSON.parse(f.get("car-side/manifest-page.json")!);
    expect(mp.uri).toBe("page://testapp.yunos.com/rpcagent");
    expect(mp.content_path).toBe("src/RpcEngine.js");
  });
  it("RpcEngine.ts is generic (no imaudio literal)", () => {
    const engine = generateCarRpcEngine(SAMPLE).get("car-side/RpcEngine.ts")!;
    expect(engine).toContain("onStart");
    expect(engine).not.toContain("imaudio");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/car-rpc-engine.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 car-rpc-engine.ts**

创建 `cli/src/generators/car-rpc-engine.ts`：
```typescript
import type { AnalysisData } from "../types.js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// RPC_ENGINE_TS = imaudio_app_code/ts/RpcEngine.ts 全文（通用 agil 引擎，无 app 字面量；Phase-1 已对照 BaseProxy/EqualizerConfigStore 核对）。
// 执行时：把 imaudio_app_code/ts/RpcEngine.ts 的全文作为模板字符串赋给 RPC_ENGINE_TS（逐字，无改动）。
const RPC_ENGINE_TS = readFileSync(resolve(__dirname, "../../../imaudio_app_code/ts/RpcEngine.ts"), "utf-8");

export function generateCarRpcEngine(analysis: AnalysisData): Map<string, string> {
  const appName = analysis.app.name;
  const manifestPage = {
    uri: `page://${appName}.yunos.com/rpcagent`,
    content_path: "src/RpcEngine.js",
    main: false,
    capabilities: { ui: { engine: "agil", display: "disp_host0" } },
    extension: {},
  };
  const result = new Map<string, string>();
  result.set("car-side/RpcEngine.ts", RPC_ENGINE_TS);
  result.set("car-side/manifest-page.json", JSON.stringify(manifestPage, null, 2) + "\n");
  return result;
}
```
> 用 `readFileSync` 在生成器运行时读 `imaudio_app_code/ts/RpcEngine.ts` 作为模板（避免在生成器里内嵌 120 行；该文件通用、无 app 字面量）。路径相对生成器文件解析。**执行时确认**该相对路径正确（`cli/src/generators/` → `../../../imaudio_app_code/ts/RpcEngine.ts`）。

- [ ] **Step 4: 运行确认通过 + tsc**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/car-rpc-engine.test.ts && npx tsc --noEmit`
Expected: PASS；tsc 零错

- [ ] **Step 5: 检查点**

---

## Task 6: 接入生成器到 scaffold.ts（files 数组 + Map 循环）

**Files:**
- Modify: `cli/src/commands/scaffold.ts`
- Test: `cli/tests/scaffold.test.ts`（追加断言）

- [ ] **Step 1: 写失败测试（追加）**

在 `cli/tests/scaffold.test.ts` 的 `describe("scaffoldProject", ...)` 内追加：
```typescript
  it("scaffold emits rpc bridge + car-side deliverables", () => {
    const analysis = JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
    scaffoldProject(analysis, OUTPUT_DIR);
    for (const f of ["src/rpc/rpc-types.ts", "src/rpc/rpc-engine.ts", "src/rpc/rpc-client.ts", "src/executors/adb-executor.ts", "car-side/RpcEngine.ts", "car-side/manifest-page.json"]) {
      expect(existsSync(resolve(OUTPUT_DIR, f)), `Missing: ${f}`).toBe(true);
    }
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/scaffold.test.ts`
Expected: FAIL（rpc/car-side 文件不存在）

- [ ] **Step 3: 接入 scaffold.ts**

在 `cli/src/commands/scaffold.ts` 顶部加 import：
```typescript
import { generateRpcBridge } from "../generators/rpc-bridge.js";
import { generateCarRpcEngine } from "../generators/car-rpc-engine.js";
```
在 `scaffoldProject` 里（现有 `generateToolHandlers` 的 Map 循环之后）追加：
```typescript
  const rpcFiles = generateRpcBridge(analysis);
  for (const [filePath, content] of rpcFiles) {
    writeFileIfNotExists(resolve(outputDir, filePath), content);
  }
  const carFiles = generateCarRpcEngine(analysis);
  for (const [filePath, content] of carFiles) {
    writeFileIfNotExists(resolve(outputDir, filePath), content);
  }
```

- [ ] **Step 4: 运行确认通过 + 全量 CLI 测试 + tsc**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/scaffold.test.ts && npx vitest run && npx tsc --noEmit`
Expected: PASS（新断言 + 全量不回归）；tsc 零错

- [ ] **Step 5: 检查点**

---

## Task 7: validate-config 命令（闸门：覆盖率 + dispatchable）

**Files:**
- Create: `cli/src/commands/validate-config.ts`
- Modify: `cli/src/cli.ts`（注册）、`cli/src/state/manager.ts`（StepName 加 validate_config）、`cli/package.json`（确保含 @im/mcp-server-framework 依赖）
- Test: `cli/tests/validate-config.test.ts`

**Interfaces:**
- Consumes: `constructDbusCall`/`constructNativeCall`（from `@im/mcp-server-framework`）、`AnalysisData`、`ParamDef`。
- Produces: `validateConfig(config, analysis): { valid; errors }`（纯 helper）+ `sampleArgs(params)` + `validateConfigCommand(args)`。

- [ ] **Step 1: 写失败测试**

创建 `cli/tests/validate-config.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { validateConfig, sampleArgs } from "../src/commands/validate-config.js";

const ANALYSIS = {
  app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" },
  capabilities: [
    { id: "read_status", domain: "vehicle", object: "gear", action: "read_status",
      params: [{ name: "mode", type: "number" }],
      safetyLevel: "readonly", sdkCalls: ["@system.vehicle"], sourceRef: "s.ts:r" },
  ],
};

describe("validateConfig", () => {
  it("valid: covers all capabilities + dispatchable", () => {
    const config = { read_status: { type: "dbus", bus: "b", path: "p", method: "request", arg: { funcName: "read" }, reply: "json" } };
    const r = validateConfig(config, ANALYSIS);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
  it("invalid: missing op for a capability (coverage)", () => {
    const r = validateConfig({}, ANALYSIS);
    expect(r.valid).toBe(false);
    expect(r.errors.join("\n")).toContain("read_status");
  });
});
describe("sampleArgs", () => {
  it("synthesizes by type, skips optional", () => {
    expect(sampleArgs([{ name: "n", type: "number" }, { name: "s", type: "string" }, { name: "b", type: "boolean" }, { name: "o", type: "string", optional: true }])).toEqual({ n: 1, s: "x", b: true });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/validate-config.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 validate-config.ts**

创建 `cli/src/commands/validate-config.ts`：
```typescript
import { readFileSync } from "fs";
import { resolve } from "path";
import { constructDbusCall, constructNativeCall } from "@im/mcp-server-framework";
import type { AnalysisData, ParamDef } from "../types.js";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

export interface ValidateConfigResult { readonly valid: boolean; readonly errors: readonly string[] }

export function sampleArgs(params: readonly ParamDef[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params ?? []) {
    if (p.optional) continue;
    if (p.enum && p.enum.length) out[p.name] = p.enum[0];
    else if (p.type === "number") out[p.name] = 1;
    else if (p.type === "boolean") out[p.name] = true;
    else out[p.name] = "x";
  }
  return out;
}

export function validateConfig(config: unknown, analysis: AnalysisData): ValidateConfigResult {
  const errors: string[] = [];
  if (!config || typeof config !== "object") return { valid: false, errors: ["config is not an object"] };
  const cfg = config as Record<string, unknown>;
  for (const cap of analysis.capabilities) {
    if (!cfg[cap.id]) errors.push(`missing op for capability: ${cap.id}`);
  }
  for (const cap of analysis.capabilities) {
    const spec = cfg[cap.id] as any;
    if (!spec) continue;
    try {
      const args = sampleArgs(cap.params);
      if (spec.type === "dbus") constructDbusCall(spec, args);
      else if (spec.type === "native") constructNativeCall(spec, args);
      else errors.push(`${cap.id}: unknown spec.type ${spec.type}`);
    } catch (e) {
      errors.push(`${cap.id}: not dispatchable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export async function validateConfigCommand(args: string[]): Promise<void> {
  const configPath = args.find((a) => !a.startsWith("--"));
  const analysisFlag = args.indexOf("--analysis");
  if (!configPath || analysisFlag === -1) throw new Error("Usage: mcp-pipeline validate-config <config.json> --analysis <analysis.json>");
  const config = JSON.parse(readFileSync(resolve(configPath), "utf-8"));
  const analysis = JSON.parse(readFileSync(resolve(args[analysisFlag + 1]), "utf-8")) as AnalysisData;
  const appName = analysis.app.name;
  let state = readState(appName) ?? createInitialState(appName, resolve(configPath));
  const result = validateConfig(config, analysis);
  try { state = updateStep(state, "validate_config", { status: result.valid ? "completed" : "failed", error: result.valid ? undefined : result.errors.join("\n") }); writeState(state); } catch {}
  if (result.valid) { process.stdout.write(`Config valid\n`); return; }
  throw new Error(`Config invalid:\n${result.errors.join("\n")}`);
}
```

- [ ] **Step 4: 注册 + StepName + 依赖**

`cli/src/cli.ts` 加 `import { validateConfigCommand } from "./commands/validate-config.js";` + COMMANDS map 加 `validate_config: validateConfigCommand,` + usage 行。`cli/src/state/manager.ts` StepName 加 `| validate_config`。确认 `cli/package.json` 含 `"@im/mcp-server-framework": "workspace:*"`（若无则加 + `npm install`）。

- [ ] **Step 5: 运行确认通过 + tsc**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/validate-config.test.ts && npx tsc --noEmit`
Expected: PASS；tsc 零错

- [ ] **Step 6: 检查点**

---

## Task 8: wire-check 命令（闸门：proxy 共用模式 → 对比 constructDbusCall）

**Files:**
- Create: `cli/src/commands/wire-check.ts`
- Modify: `cli/src/cli.ts`（注册）、`cli/src/state/manager.ts`（StepName 加 wire_check）
- Test: `cli/tests/wire-check.test.ts`

- [ ] **Step 1: 写失败测试**

创建 `cli/tests/wire-check.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { wireCheck, extractExpectedWire } from "../src/commands/wire-check.js";

const PROXY_SRC = `
getSoundStage() {
  let msg = this._iface.createMethodCallMessage("request");
  const params = { funcName: "audiopolicyservice.yunos.com/baseModeules/requstGetSoundEffectsMode" };
  msg.writeString(JSON.stringify(params));
  let data = result.readJSON();
}`;
const CONFIG = {
  soundstage_read: { type: "dbus", bus: "com.yunos.audiopolicyservice", path: "/com/yunos/audiopolicyservice",
    method: "request", arg: { funcName: "audiopolicyservice.yunos.com/baseModeules/requstGetSoundEffectsMode" }, reply: "json" },
};

describe("wireCheck", () => {
  it("extractExpectedWire pulls funcName + method from common proxy pattern", () => {
    const wires = extractExpectedWire(PROXY_SRC);
    expect(wires.length).toBeGreaterThan(0);
    expect(wires[0].method).toBe("request");
    expect(wires[0].arg.funcName).toContain("requstGetSoundEffectsMode");
  });
  it("valid when config matches extracted wire", () => {
    expect(wireCheck(CONFIG, PROXY_SRC).valid).toBe(true);
  });
  it("invalid when config funcName diverges", () => {
    const bad = { soundstage_read: { ...CONFIG.soundstage_read, arg: { funcName: "WRONG" } } };
    expect(wireCheck(bad, PROXY_SRC).valid).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/wire-check.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 wire-check.ts**

创建 `cli/src/commands/wire-check.ts`：
```typescript
import { readFileSync } from "fs";
import { resolve } from "path";
import { constructDbusCall } from "@im/mcp-server-framework";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

export interface ExpectedWire { readonly method: string; readonly arg: { readonly funcName: string } }

/** 静态解析 proxy 共用模式：createMethodCallMessage("m") ... funcName: "f" */
export function extractExpectedWire(src: string): ExpectedWire[] {
  const out: ExpectedWire[] = [];
  const re = /createMethodCallMessage\(\s*"([^"]+)"\s*\)[\s\S]{0,400}?funcName:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ method: m[1], arg: { funcName: m[2] } });
  return out;
}

export interface WireCheckResult { readonly valid: boolean; readonly errors: readonly string[] }

export function wireCheck(config: unknown, proxySource: string): WireCheckResult {
  const errors: string[] = [];
  const cfg = config as Record<string, any>;
  for (const w of extractExpectedWire(proxySource)) {
    const opEntry = Object.values(cfg).find((s: any) => s?.arg?.funcName === w.arg.funcName);
    if (!opEntry) { errors.push(`proxy funcName "${w.arg.funcName}" not found in config`); continue; }
    try {
      const call = constructDbusCall(opEntry as any, {});
      const arg = JSON.parse(call.argString);
      if (arg.funcName !== w.arg.funcName || call.method !== w.method) errors.push(`wire mismatch for ${w.arg.funcName}`);
    } catch (e) { errors.push(`construct failed for ${w.arg.funcName}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { valid: errors.length === 0, errors };
}

export async function wireCheckCommand(args: string[]): Promise<void> {
  const configPath = args.find((a) => !a.startsWith("--") && !a.startsWith("--proxy"));
  const proxyFlag = args.indexOf("--proxy");
  if (!configPath || proxyFlag === -1) throw new Error("Usage: mcp-pipeline wire-check <config.json> --proxy <proxy.ts>");
  const config = JSON.parse(readFileSync(resolve(configPath), "utf-8"));
  const proxySrc = readFileSync(resolve(args[proxyFlag + 1]), "utf-8");
  const result = wireCheck(config, proxySrc);
  const appName = "app";
  let state = readState(appName) ?? createInitialState(appName, resolve(configPath));
  try { state = updateStep(state, "wire_check", { status: result.valid ? "completed" : "failed", error: result.valid ? undefined : result.errors.join("\n") }); writeState(state); } catch {}
  if (result.valid) { process.stdout.write(`Wire check passed\n`); return; }
  throw new Error(`Wire check failed:\n${result.errors.join("\n")}`);
}
```

- [ ] **Step 4: 注册 + StepName**

`cli/src/cli.ts` 加 import + `wire_check: wireCheckCommand,` + usage。`state/manager.ts` StepName 加 `| wire_check`。

- [ ] **Step 5: 运行确认通过 + tsc**

Run: `cd D:/IM/im-mcp-codeagent/cli && npx vitest run tests/wire-check.test.ts && npx tsc --noEmit`
Expected: PASS；tsc 零错

- [ ] **Step 6: 检查点**

---

## Task 9: skills 方法论（mcp-generate config 抽取 + mcp-pipeline 编排）

**Files:**
- Modify: `skills/mcp-generate/SKILL.md`、`skills/mcp-pipeline/SKILL.md`

> 方法论文档（无 LLM call 在插件内；指导宿主 agent）。验证 = review（对照 spec §4.3/§4.4）。

- [ ] **Step 1: 改 mcp-generate/SKILL.md**

读 `skills/mcp-generate/SKILL.md`，**移除** throw 桩指令（`:54-57,76`），**替换为** config 抽取方法论：
- 说明：scaffold 已确定性产出 rpc 桥 + yunos-adapter（rpcCall+按名映射DTO，不再 throw）；**本步骤只产 `rpc/config.json`**（op→wire-spec）。
- 步骤：① 对 analysis 每个 capability，按 `sourceRef` 定位 proxy/manager 源码；② 抽 wire-spec（dbus：bus/path/method/arg/stringify/reply；native：require/factory/method/args），参照 `imaudio_app_code/rpc/config.json`（soundstage 范例）+ `imaudio_app_code/ts/proxy/AudioPolicyProxy.ts`；③ 写 `rpc/config.json`，op=cap.id；④ 跑 `mcp-pipeline validate-config rpc/config.json --analysis .mcp-pipeline/<app>/analysis.json` 与 `mcp-pipeline wire-check rpc/config.json --proxy <proxy.ts>`，**失败据报错改 config 重跑**（N 次不过上浮）。
- 摘 soundstage.read/set 的 config 范例片段（从 `imaudio_app_code/rpc/config.json`）。

- [ ] **Step 2: 改 mcp-pipeline/SKILL.md**

在 analyze→scaffold→generate 流程插入：scaffold 后、build 前，宿主 agent 按 mcp-generate 产 `rpc/config.json` → `validate-config` → `wire-check`；**两闸门都过才进 build**，否则打回。

- [ ] **Step 3: review 自检**

对照 spec §4.3/§4.4/§0：SKILL.md 无 throw 桩指令、含 config 方法论+范例+闸门回路。

- [ ] **Step 4: 检查点**

---

## Task 10: 回归——用生成器重生成 mcp-imaudio，验证桥行为与 Phase-1 一致

**Files:** 无（运行验证）

- [ ] **Step 1: 用 pipeline 重生成（临时目录，不覆盖现有）**

```bash
cd D:/IM/im-mcp-codeagent
node cli/bin/mcp-pipeline.js scaffold schema/__tests__/fixtures/imaudio-analysis.json --output ./_sp_b_regression/mcp-imaudio
# 宿主 agent 按 mcp-generate 产 _sp_b_regression/mcp-imaudio/rpc/config.json（参照 Phase-1）
node cli/bin/mcp-pipeline.js validate-config _sp_b_regression/mcp-imaudio/rpc/config.json --analysis schema/__tests__/fixtures/imaudio-analysis.json
```
Expected: scaffold 产出 rpc 桥 + yunos-adapter(rpcCall) + car-side 交付物；validate-config 过。

- [ ] **Step 2: 生成器零 app 字面量**

Run: `cd D:/IM/im-mcp-codeagent && grep -riE "imaudio|soundstage" cli/src/generators/ cli/src/commands/validate-config.ts cli/src/commands/wire-check.ts | grep -viE "//|\.test\.|sample" | head`
Expected: 无匹配。

- [ ] **Step 3: 桥行为与 Phase-1 一致 + 产物 build**

对比 `_sp_b_regression/mcp-imaudio/src/rpc/rpc-client.ts` 的 RPC_URL = `page://imaudio.yunos.com/rpcagent`；soundstage 走 `rpcFn("soundstage_read"/"soundstage_set")` + 按名映射 DTO。
Run: `cd D:/IM/im-mcp-codeagent/_sp_b_regression/mcp-imaudio && npm install && npx tsc --noEmit`
Expected: 零错。

- [ ] **Step 4: 清理 + 检查点**

`rm -rf _sp_b_regression`。Phase-1 手工版 mcp-imaudio 保留（同事装车基线）。

---

## Self-Review

**1. Spec 覆盖**：§2 切分→T1-T6；§4.1 生成器→T2/T3/T4/T5/T6；§4.2 闸门→T7/T8；§4.3 方法论→T9；§4.4 编排→T9；§5 schema→T1/T7；§8 验收→T6/T7/T8/T9/T10。✓

**2. Placeholder 扫描**：T1 rpc-spec（逐字搬 Phase-1 rpc-engine.ts，源存在）；T3 generateConfigTs（读 mcp-imaudio/src/config.ts 并入，源存在）；T5 RPC_ENGINE_TS（readFileSync 读 imaudio_app_code/ts/RpcEngine.ts，源存在）。其余代码完整。无 TBD。✓

**3. 类型一致性**：`generateRpcBridge`/`generateCarRpcEngine`→`Map<string,string>`（scaffold 循环消费）；`generateYunosAdapterRpc`→`string`（files 数组）；`validateConfig`/`wireCheck`→`{valid,errors}`；`constructDbusCall`/`constructNativeCall`（framework）↔ T2 rpc-engine 导出 + T7/T8 消费；StepName `validate_config`/`wire_check`；op=`cap.id` 贯穿 T4/T7/T9。✓

**4. 执行期依赖**：cli/package.json 需 `@im/mcp-server-framework`（T7 Step 4 标注）；T5 路径相对解析（执行时确认）；T1/T3/T5 读 Phase-1 源文件（均在仓库）。
