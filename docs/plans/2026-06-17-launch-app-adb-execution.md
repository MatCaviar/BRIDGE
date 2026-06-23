# Launch App + ADB Executor 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 mcp-imaudio server 新增 `launch_app` tool，通过 adb-executor 执行 `adb -host shell sendlink` 真实启动车机 imaudio 应用。

**Architecture:** 新增通用 `adb-executor`（命令模式注册表，单点注册 sendlink，为泛化 dbus-call 留口）。`launch_app` 作为 capability 加入 analysis.json（e2e 可见）+ mcp-imaudio server（实际执行）。yunos-adapter 实现 launchApp 调 adb-executor，配置走 YAML（禁环境变量）。

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, zod, vitest, Node.js child_process

**Spec:** `D:\IM\im-mcp-codeagent\docs\specs\2026-06-17-real-adb-execution-design.md`

**Git note:** 项目可能非 git 仓库。每个 Task 末尾的 commit 步骤——若是 git 仓库则执行；否则作为「验证检查点」，确认本 Task 产出可用再进入下一个。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `im-mcp-codeagent/tools/adb/{adb.exe,AdbWinApi.dll,AdbWinUsbApi.dll}` | 项目级 YunOS adb 工具 | 新建（拷贝） |
| `mcp-imaudio/conf/config.yaml` | YAML 配置（adapter + adb 段） | 修改 |
| `mcp-imaudio/src/config.ts` | 读 YAML，解析 adb 配置为绝对路径 | 修改 |
| `mcp-imaudio/src/executors/adb-executor.ts` | 通用 adb 命令执行器（注册表） | 新建 |
| `mcp-imaudio/src/adapters/types.ts` | IAdapter 接口 + LaunchAppResult | 修改 |
| `mcp-imaudio/src/adapters/mock-adapter.ts` | mock launchApp | 修改 |
| `mcp-imaudio/src/adapters/yunos-adapter.ts` | 真实 launchApp 调 adb-executor | 修改 |
| `mcp-imaudio/src/adapters/index.ts` | 工厂：false 用 yunos adapter | 修改 |
| `mcp-imaudio/src/tools/launch.ts` | launch_app tool 注册 | 新建 |
| `mcp-imaudio/src/index.ts` | server 入口，注册 launch tools | 修改 |
| `schema/__tests__/fixtures/imaudio-analysis.json` | launch_app capability（e2e 可见） | 修改 |
| `mcp-imaudio/tests/unit/adb-executor.test.ts` | adb-executor 单测 | 新建 |

---

## Task 1: 拷贝 adb 工具到项目级

**Files:**
- Create: `im-mcp-codeagent/tools/adb/adb.exe`, `AdbWinApi.dll`, `AdbWinUsbApi.dll`

- [ ] **Step 1: 创建目录并拷贝三件套**

```bash
mkdir -p D:/IM/im-mcp-codeagent/tools/adb
cp "C:/Users/matca/AppData/Local/ZebraAlfred/adb/adb.exe" D:/IM/im-mcp-codeagent/tools/adb/
cp "C:/Users/matca/AppData/Local/ZebraAlfred/adb/AdbWinApi.dll" D:/IM/im-mcp-codeagent/tools/adb/
cp "C:/Users/matca/AppData/Local/ZebraAlfred/adb/AdbWinUsbApi.dll" D:/IM/im-mcp-codeagent/tools/adb/
```

- [ ] **Step 2: 验证拷贝的 adb 可用**

Run:
```bash
D:/IM/im-mcp-codeagent/tools/adb/adb.exe version
```
Expected: `Adb tool for YunOS 5.0.41 (2017-09-15)`

- [ ] **Step 3: 验证实机 sendlink 仍工作（用新路径）**

Run:
```bash
D:/IM/im-mcp-codeagent/tools/adb/adb.exe -host shell sendlink page://imaudio.yunos.com/imaudio
```
Expected: `SUCCESS: {"data":"","proxyName":"","targetPageId":"..."}`

- [ ] **Step 4: 检查点** —— 确认三件套就位、实机可打开。

---

## Task 2: 扩展配置（config.yaml + config.ts）

**Files:**
- Modify: `mcp-imaudio/conf/config.yaml`
- Modify: `mcp-imaudio/src/config.ts`
- Test: `mcp-imaudio/tests/unit/config.test.ts`（新建）

- [ ] **Step 1: 写失败的配置测试**

`mcp-imaudio/tests/unit/config.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { readConfig } from "../../src/config.js";
import { resolve } from "path";

describe("readConfig", () => {
  it("parses adb config with absolute path resolution", () => {
    const cfg = readConfig(resolve(__dirname, "../../conf/config.yaml"));
    expect(cfg.adapter.mock_mode).toBe(false);
    expect(cfg.adb).toBeDefined();
    expect(cfg.adb!.path).toMatch(/[A-Z]:\\.*adb\.exe$/); // 绝对路径
    expect(cfg.adb!.use_host).toBe(true);
    expect(cfg.adb!.timeout_ms).toBe(10000);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd mcp-imaudio && npx vitest run tests/unit/config.test.ts`
Expected: FAIL（`cfg.adb` undefined，类型不匹配）

- [ ] **Step 3: 扩展 config.yaml**

在 `mcp-imaudio/conf/config.yaml` 的 `adapter:` 段后追加（并把 mock_mode 改 false 用于真实执行）：
```yaml
adapter:
  mock_mode: false

adb:
  path: "../../tools/adb/adb.exe"   # 相对 conf/ 目录；config.ts 解析为绝对路径
  use_host: true
  timeout_ms: 10000
```

- [ ] **Step 4: 扩展 config.ts**

替换 `mcp-imaudio/src/config.ts` 全文为：
```typescript
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export interface AdbConfig {
  readonly path: string;       // 解析后的绝对路径
  readonly use_host: boolean;
  readonly timeout_ms: number;
}

export interface ServerConfig {
  readonly adapter: {
    readonly mock_mode: boolean;
  };
  readonly adb: AdbConfig;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseMockMode(yaml: string): boolean {
  const m = yaml.match(/adapter:[\s\S]*?mock_mode:\s*(\w+)/);
  return m && m[1] ? m[1] !== "false" : true;
}

function parseAdb(yaml: string): AdbConfig {
  const DEFAULT_PATH = resolve(__dirname, "..", "..", "tools", "adb", "adb.exe");
  const pathMatch = yaml.match(/adb:[\s\S]*?path:\s*["']?([^"'\n]+)["']?/);
  const hostMatch = yaml.match(/adb:[\s\S]*?use_host:\s*(\w+)/);
  const timeoutMatch = yaml.match(/adb:[\s\S]*?timeout_ms:\s*(\d+)/);
  const rawPath = pathMatch && pathMatch[1] ? pathMatch[1].trim() : DEFAULT_PATH;
  // 相对路径基于 conf/ 目录解析为绝对路径（不依赖运行时 cwd）
  const absPath = resolve(__dirname, "..", "conf", rawPath);
  return {
    path: absPath,
    use_host: hostMatch && hostMatch[1] ? hostMatch[1] !== "false" : true,
    timeout_ms: timeoutMatch && timeoutMatch[1] ? parseInt(timeoutMatch[1], 10) : 10000,
  };
}

export function readConfig(configPath?: string): ServerConfig {
  const path = configPath ?? resolve(__dirname, "..", "conf", "config.yaml");
  if (!existsSync(path)) {
    return {
      adapter: { mock_mode: true },
      adb: { path: resolve(__dirname, "..", "..", "tools", "adb", "adb.exe"), use_host: true, timeout_ms: 10000 },
    };
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return { adapter: { mock_mode: parseMockMode(raw) }, adb: parseAdb(raw) };
  } catch {
    return {
      adapter: { mock_mode: true },
      adb: { path: resolve(__dirname, "..", "..", "tools", "adb", "adb.exe"), use_host: true, timeout_ms: 10000 },
    };
  }
}
```

- [ ] **Step 5: 运行测试，确认通过**

Run: `cd mcp-imaudio && npx vitest run tests/unit/config.test.ts`
Expected: PASS

- [ ] **Step 6: 检查点**

---

## Task 3: adb-executor（TDD）

**Files:**
- Create: `mcp-imaudio/src/executors/adb-executor.ts`
- Test: `mcp-imaudio/tests/unit/adb-executor.test.ts`

- [ ] **Step 1: 写失败的 adb-executor 测试**

`mcp-imaudio/tests/unit/adb-executor.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { registerCommand, execute, clearCommands } from "../../src/executors/adb-executor.js";
import type { AdbConfig } from "../../src/config.js";

const STUB_CONFIG: AdbConfig = {
  path: "D:/IM/im-mcp-codeagent/tools/adb/adb.exe",
  use_host: true,
  timeout_ms: 10000,
};

describe("adb-executor command registry", () => {
  beforeEach(() => clearCommands());

  it("rejects unknown command", async () => {
    const r = await execute("nonexistent", {}, STUB_CONFIG);
    expect(r.success).toBe(false);
    expect(r.rawOutput).toContain("unknown command");
  });

  it("sendlink command resolves against real device", async () => {
    registerCommand("sendlink", (a) => `shell sendlink ${a.url}`);
    const r = await execute("sendlink", { url: "page://imaudio.yunos.com/imaudio" }, STUB_CONFIG);
    expect(r.success).toBe(true);
    expect(r.parsed).toHaveProperty("targetPageId");
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd mcp-imaudio && npx vitest run tests/unit/adb-executor.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 adb-executor**

`mcp-imaudio/src/executors/adb-executor.ts`:
```typescript
import { spawn } from "node:child_process";
import type { AdbConfig } from "../config.js";

export interface ExecResult {
  readonly success: boolean;
  readonly rawOutput: string;
  readonly parsed?: unknown;
}

type CommandHandler = (args: Record<string, unknown>) => string;

const commandRegistry = new Map<string, CommandHandler>();

export function registerCommand(name: string, handler: CommandHandler): void {
  commandRegistry.set(name, handler);
}

export function clearCommands(): void {
  commandRegistry.clear();
}

export function getRegisteredCommands(): string[] {
  return Array.from(commandRegistry.keys());
}

export async function execute(
  commandName: string,
  args: Record<string, unknown>,
  config: AdbConfig,
): Promise<ExecResult> {
  const handler = commandRegistry.get(commandName);
  if (!handler) {
    return { success: false, rawOutput: `unknown command: ${commandName}` };
  }
  const argString = handler(args);
  const fullArgs = [...(config.use_host ? ["-host"] : []), ...argString.split(/\s+/).filter(Boolean)];

  return new Promise<ExecResult>((resolveResult) => {
    let stdout = "";
    const child = spawn(config.path, fullArgs, { timeout: config.timeout_ms });
    child.stdout.on("data", (d) => { stdout += d.toString(); });
    child.on("error", (err) => {
      resolveResult({ success: false, rawOutput: `spawn error: ${err.message}` });
    });
    child.on("close", (code) => {
      const trimmed = stdout.trim();
      if (code === 0 && trimmed.startsWith("SUCCESS:")) {
        const jsonPart = trimmed.slice("SUCCESS:".length).trim();
        let parsed: unknown = undefined;
        try { parsed = JSON.parse(jsonPart); } catch { /* 非 JSON，保留 rawOutput */ }
        resolveResult({ success: true, rawOutput: trimmed, parsed });
      } else {
        resolveResult({ success: false, rawOutput: trimmed || `exit code ${code}` });
      }
    });
  });
}

// 单点：注册 sendlink（泛化时在此追加 dbus-call 等）
registerCommand("sendlink", (args) => `shell sendlink ${String(args.url)}`);
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd mcp-imaudio && npx vitest run tests/unit/adb-executor.test.ts`
Expected: PASS（sendlink 测试依赖实机连接）

> 注：`sendlink resolves against real device` 需车机在线。CI 无实机时可 `.skip` 或 mock spawn，但本单点以实机验证为准。

- [ ] **Step 5: 检查点**

---

## Task 4: types.ts 加 LaunchAppResult + launchApp 方法

**Files:**
- Modify: `mcp-imaudio/src/adapters/types.ts`

- [ ] **Step 1: 加 LaunchAppResult 类型**

在 `mcp-imaudio/src/adapters/types.ts` 的 AppstatusReadResult 定义之后追加：
```typescript
export interface LaunchAppResult {
  readonly success: boolean;
  readonly targetPageId: string;
  readonly appName: string;
}
```

- [ ] **Step 2: IAdapter 接口加 launchApp 方法**

在 `IAdapter` 接口的 `readAppStatus()` 行之后追加：
```typescript
  launchApp(appName: string): Promise<LaunchAppResult>;
```

- [ ] **Step 3: 验证类型检查**

Run: `cd mcp-imaudio && npx tsc --noEmit`
Expected: 报错 mock-adapter/yunos-adapter 缺 launchApp（预期，Task 6/7 补）

- [ ] **Step 4: 检查点**

---

## Task 5: analysis.json 加 launch_app capability

**Files:**
- Modify: `schema/__tests__/fixtures/imaudio-analysis.json`

- [ ] **Step 1: 在 capabilities 数组末尾加 launch_app**

在 `schema/__tests__/fixtures/imaudio-analysis.json` 的 `capabilities` 数组最后一个元素（appstatus_read 之后）追加：
```json
    ,
    {
      "id": "launch_app",
      "domain": "system",
      "object": "app",
      "action": "launch",
      "params": [
        { "name": "appName", "type": "string", "enum": ["imaudio"] }
      ],
      "returns": {
        "type": "LaunchAppResult",
        "fields": ["success", "targetPageId", "appName"]
      },
      "safetyLevel": "normal",
      "sdkCalls": [],
      "sourceRef": "adb:sendlink"
    }
```

- [ ] **Step 2: 验证 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('D:/IM/im-mcp-codeagent/schema/__tests__/fixtures/imaudio-analysis.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: 验证 e2e system prompt 含 launch_app**

Run:
```bash
cd D:/IM/im-mcp-codeagent/e2e-test-runner && python -c "from prompt_generator import generate_system_prompt_from_servers as g; p=g(); print('launch_app' in p, p.count('### Tool name:'))"
```
Expected: `True 19`（原 18 + launch_app）

- [ ] **Step 4: 检查点**

---

## Task 6: mock-adapter 加 launchApp（TDD）

**Files:**
- Modify: `mcp-imaudio/src/adapters/mock-adapter.ts`
- Test: `mcp-imaudio/tests/unit/mock-adapter.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `tests/unit/mock-adapter.test.ts` 末尾的最后一个 `describe` 之后追加：
```typescript
  describe("system: launch_app", () => {
    it("launchApp returns success with targetPageId", async () => {
      const result = await adapter.launchApp("imaudio");
      expect(result.success).toBe(true);
      expect(result.appName).toBe("imaudio");
      expect(result.targetPageId).toBeTruthy();
    });

    it("launchApp propagates injected errors", async () => {
      control.setError("launchApp", new Error("injected"));
      await expect(adapter.launchApp("imaudio")).rejects.toThrow("injected");
    });
  });
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd mcp-imaudio && npx vitest run tests/unit/mock-adapter.test.ts`
Expected: FAIL（adapter.launchApp 不是函数）

- [ ] **Step 3: mock-adapter 实现 launchApp**

在 `mcp-imaudio/src/adapters/mock-adapter.ts` 的 `createMockAdapter()` 返回的 adapter 对象里（`readAppStatus` 之后）加：
```typescript
    async launchApp(appName: string): Promise<import("./types.js").LaunchAppResult> {
      if (errors.get("launchApp")) throw errors.get("launchApp")!;
      return { success: true, targetPageId: "mock-page-0001", appName };
    },
```
（`errors` Map 已在 mock-adapter 内存在，`control.setError` 操作的就是它。）

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd mcp-imaudio && npx vitest run tests/unit/mock-adapter.test.ts`
Expected: PASS

- [ ] **Step 5: 检查点**

---

## Task 7: yunos-adapter 实现 launchApp

**Files:**
- Modify: `mcp-imaudio/src/adapters/yunos-adapter.ts`

- [ ] **Step 1: 改造 createYunosAdapter 接收 adb 配置**

把 `mcp-imaudio/src/adapters/yunos-adapter.ts` 的 `export function createYunosAdapter(): IAdapter {` 改为：
```typescript
import { execute } from "../executors/adb-executor.js";
import type { AdbConfig } from "../config.js";

export function createYunosAdapter(adbConfig: AdbConfig): IAdapter {
```

- [ ] **Step 2: 实现 launchApp（其余方法保持 throw stub）**

在返回的 adapter 对象里（`readAppStatus` 之后）加：
```typescript
    async launchApp(appName: string): Promise<LaunchAppResult> {
      const url = `page://${appName}.yunos.com/${appName}`;
      const r = await execute("sendlink", { url }, adbConfig);
      if (!r.success) {
        throw new Error(`launch_app failed: ${r.rawOutput}`);
      }
      const parsed = (r.parsed ?? {}) as { targetPageId?: string };
      return {
        success: true,
        targetPageId: parsed.targetPageId ?? "",
        appName,
      };
    },
```
并在顶部 import 加 `LaunchAppResult`：
```typescript
import type { IAdapter, ..., AppstatusReadResult, LaunchAppResult } from "./types.js";
```

> **stub 处理说明**：其余 18 个方法保持 `throw new Error("xxx not implemented")`。tool handler 已 try/catch（见 system.ts 模式），抛出的异常会被转为 `formatError` 结构化错误返回 LLM —— 实质满足 spec §7「不崩 + LLM 得结构化未实现反馈」，且 surgical（不改 18 个方法 + Result 类型）。

- [ ] **Step 3: 验证类型检查**

Run: `cd mcp-imaudio && npx tsc --noEmit`
Expected: 无 yunos-adapter 相关错误（index.ts 可能报 createYunosAdapter 签名变化，Task 8 修）

- [ ] **Step 4: 检查点**

---

## Task 8: 工厂 index.ts 切换 yunos adapter

**Files:**
- Modify: `mcp-imaudio/src/adapters/index.ts`

- [ ] **Step 1: 替换 createAdapter 的非 mock 分支**

把 `mcp-imaudio/src/adapters/index.ts` 的 `createAdapter` 函数改为：
```typescript
import { createYunosAdapter } from "./yunos-adapter.js";

export function createAdapter(config: ServerConfig): { adapter: IAdapter; control: MockAdapterControl | null } {
  if (config.adapter.mock_mode) {
    const { adapter, control } = createMockAdapter();
    return { adapter, control };
  }
  // 真实执行模式：yunos adapter + adb-executor
  const adapter = createYunosAdapter(config.adb);
  return { adapter, control: null };
}
```

- [ ] **Step 2: 验证类型检查**

Run: `cd mcp-imaudio && npx tsc --noEmit`
Expected: PASS（无错误）

- [ ] **Step 3: 检查点**

---

## Task 9: launch_app tool 注册 + server 接入

**Files:**
- Create: `mcp-imaudio/src/tools/launch.ts`
- Modify: `mcp-imaudio/src/index.ts`（server 入口）

- [ ] **Step 1: 创建 launch tool 注册**

`mcp-imaudio/src/tools/launch.ts`:
```typescript
import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import { LAUNCH_APP_FAILED } from "../types/errors.js";

export function registerLaunchTools(server: McpServer, adapter: IAdapter): void {
  server.registerTool(
    "launch_app",
    {
      description: "Launch an application on the device via sendlink",
      inputSchema: {
        appName: z.enum(["imaudio"]),
      },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.launchApp(input.appName as string);
        return formatSuccess(result);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return formatError(LAUNCH_APP_FAILED, msg, "system");
      }
    },
  );
}
```

- [ ] **Step 2: 加错误码**

在 `mcp-imaudio/src/types/errors.ts` 加（仿现有错误码格式）：
```typescript
export const LAUNCH_APP_FAILED = "LAUNCH_APP_FAILED";
```
（若 errors.ts 用对象/枚举格式，按现有模式加。）

- [ ] **Step 3: server 入口注册 launch tools**

在 `mcp-imaudio/src/index.ts`（或 server.ts）的其它 `registerXxxTools` 调用旁加：
```typescript
import { registerLaunchTools } from "./tools/launch.js";
// ...
registerLaunchTools(server, adapter);
```

- [ ] **Step 4: 验证类型检查 + build**

Run: `cd mcp-imaudio && npx tsc --noEmit && npm run build`
Expected: PASS，生成 dist/

- [ ] **Step 5: 检查点**

---

## Task 10: 端到端验证（实机）

**Files:**
- Modify: `e2e-test-runner/config.yaml`（imaudio server path 指向 mcp-imaudio）

- [ ] **Step 1: 确认 e2e config 指向真实 mcp-imaudio**

检查 `e2e-test-runner/config.yaml` 的 imaudio server 配置，确保 `path` 指向已 build 的 `mcp-imaudio`：
```yaml
  - name: "imaudio"
    path: "../mcp-imaudio"
    command: "node"
    args: ["dist/index.js"]
```

- [ ] **Step 2: 确认 mcp-imaudio mock_mode 为 false（真实执行）**

确认 `mcp-imaudio/conf/config.yaml`：
```yaml
adapter:
  mock_mode: false
```

- [ ] **Step 3: build mcp-imaudio**

Run: `cd mcp-imaudio && npm run build`
Expected: 无错误，dist/index.js 存在

- [ ] **Step 4: 端到端运行**

Run（用 venv python）:
```bash
cd D:/IM/im-mcp-codeagent/e2e-test-runner
echo "打开imaudio" | "D:/ZZT/z-aip/.venv/Scripts/python.exe" interactive.py
```
Expected: LLM 调用 `launch_app` tool，实机打开 imaudio 页面（用户观察确认）

- [ ] **Step 5: 用户确认实机反应**

实机应打开 imaudio 应用。确认 SUCCESS + targetPageId 返回。

- [ ] **Step 6: 检查点 —— 单点功能完成**

---

## Self-Review

**1. Spec 覆盖**：
- adb 项目级 → Task 1 ✓
- config.yaml + config.ts（__dirname 绝对路径，零环境变量）→ Task 2 ✓
- adb-executor 注册表 + sendlink → Task 3 ✓
- launch_app capability 加 analysis.json → Task 5 ✓
- yunos-adapter.launchApp 调 adb-executor → Task 7 ✓
- mock-adapter launchApp → Task 6 ✓
- adapter.mock_mode 切换 → Task 8 ✓
- stub 不崩（tool handler try/catch）→ Task 7/9 注释 ✓
- 端到端 → Task 10 ✓
- 注册表扩展点（dbus-call 留口）→ Task 3 registerCommand 设计 ✓

**2. Placeholder 扫描**：无 TBD/TODO，所有 code step 含真实代码。

**3. 类型一致性**：`LaunchAppResult{success,targetPageId,appName}` 贯穿 Task 4/6/7/9 一致；`launchApp(appName)` 签名一致；`execute(commandName,args,config)` 贯穿 Task 3/7 一致。

**4. 泛化扩展点验证**：Task 3 的 `registerCommand` 设计——泛化时追加 `registerCommand("dbus-call", ...)` 即可，不改 execute 内核（满足 spec §5.3）。
