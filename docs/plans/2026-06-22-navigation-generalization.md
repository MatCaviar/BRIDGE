# 方向1 系统级跳转泛化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 扩展 launch_app 支持多系统级跳转目标（imaudio/lightpoint/smartcar），复用已验证的 sendlink。

**Architecture:** 加 `APP_PAGE_URI` 映射表（appName→page:// URI），yunos-adapter.launchApp 改查映射（当前硬编码 yunos.com 模式只适合 imaudio）。复用 adb-executor 已注册的 sendlink 命令，不走 D-Bus。

**Tech Stack:** TypeScript, @modelcontextprotocol/sdk, zod, vitest

**Spec:** `D:\IM\im-mcp-codeagent\docs\specs\2026-06-22-navigation-generalization-design.md`

**Git note:** 项目非 git 仓库。Task 末尾 commit 步骤——若是 git 则执行；否则作为验证检查点。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `mcp-imaudio/src/adapters/yunos-adapter.ts` | 真实 launchApp（改查映射） | 修改 |
| `mcp-imaudio/src/adapters/app-page-uri.ts` | APP_PAGE_URI 映射表（单一职责，可测） | 新建 |
| `mcp-imaudio/tests/unit/app-page-uri.test.ts` | 映射表单测 | 新建 |
| `mcp-imaudio/tests/unit/yunos-adapter-launch.test.ts` | launchApp 未知 appName 抛错 | 新建 |
| `mcp-imaudio/tests/unit/mock-adapter.test.ts` | lightpoint/smartcar mock 测试 | 修改 |
| `schema/__tests__/fixtures/imaudio-analysis.json` | launch_app appName enum | 修改 |
| `mcp-imaudio/src/tools/launch.ts` | inputSchema appName enum | 修改 |

---

## Task 1: APP_PAGE_URI 映射表（TDD）

**Files:**
- Create: `mcp-imaudio/src/adapters/app-page-uri.ts`
- Test: `mcp-imaudio/tests/unit/app-page-uri.test.ts`

- [ ] **Step 1: 写失败的映射表测试**

创建 `mcp-imaudio/tests/unit/app-page-uri.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { APP_PAGE_URI, resolvePageUri } from "../../src/adapters/app-page-uri.js";

describe("APP_PAGE_URI", () => {
  it("contains imaudio/lightpoint/smartcar targets", () => {
    expect(APP_PAGE_URI.imaudio).toBe("page://imaudio.yunos.com/imaudio");
    expect(APP_PAGE_URI.lightpoint).toBe("page://lightpoint.yunos.com/ShowRoomPage");
    expect(APP_PAGE_URI.smartcar).toBe("page://smartcar.ivi.com/smartcar");
  });
});

describe("resolvePageUri", () => {
  it("resolves known app", () => {
    expect(resolvePageUri("lightpoint")).toBe("page://lightpoint.yunos.com/ShowRoomPage");
  });

  it("returns undefined for unknown app", () => {
    expect(resolvePageUri("nonexistent")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/app-page-uri.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现映射表**

创建 `mcp-imaudio/src/adapters/app-page-uri.ts`:
```typescript
/**
 * Maps appName to its system page:// URI for sendlink navigation.
 * Derived from imaudio_app_code PageLink usage. System-level (adb sendlink),
 * does NOT go through app D-Bus (which is permission-blocked).
 */
export const APP_PAGE_URI: Readonly<Record<string, string>> = {
  imaudio: "page://imaudio.yunos.com/imaudio",
  lightpoint: "page://lightpoint.yunos.com/ShowRoomPage",
  smartcar: "page://smartcar.ivi.com/smartcar",
};

export function resolvePageUri(appName: string): string | undefined {
  return APP_PAGE_URI[appName];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/app-page-uri.test.ts`
Expected: PASS（3 tests）

- [ ] **Step 5: 检查点**

---

## Task 2: yunos-adapter.launchApp 改查映射（TDD）

**Files:**
- Modify: `mcp-imaudio/src/adapters/yunos-adapter.ts`
- Test: `mcp-imaudio/tests/unit/yunos-adapter-launch.test.ts`

- [ ] **Step 1: 写失败测试（未知 appName 抛错）**

创建 `mcp-imaudio/tests/unit/yunos-adapter-launch.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { createYunosAdapter } from "../../src/adapters/yunos-adapter.js";
import type { AdbConfig } from "../../src/config.js";

const STUB_CONFIG: AdbConfig = {
  path: "D:/IM/im-mcp-codeagent/tools/adb/adb.exe",
  use_host: true,
  timeout_ms: 10000,
};

describe("yunos-adapter launchApp", () => {
  it("throws on unknown appName (does not call adb)", async () => {
    const adapter = createYunosAdapter(STUB_CONFIG);
    await expect(adapter.launchApp("nonexistent")).rejects.toThrow(/unknown app/);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/yunos-adapter-launch.test.ts`
Expected: FAIL（launchApp 不抛 "unknown app"，当前硬编码 url 不报错）

- [ ] **Step 3: 改 launchApp 查映射**

在 `mcp-imaudio/src/adapters/yunos-adapter.ts`：
1. 顶部加 import：
```typescript
import { resolvePageUri } from "./app-page-uri.js";
```
2. 把 `launchApp` 方法（当前 `const url = page://${appName}.yunos.com/${appName}`）替换为：
```typescript
    async launchApp(appName: string): Promise<LaunchAppResult> {
      const url = resolvePageUri(appName);
      if (!url) {
        throw new Error(`unknown app: ${appName}`);
      }
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
（其余方法不变）

- [ ] **Step 4: 运行确认通过**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/yunos-adapter-launch.test.ts`
Expected: PASS（unknown app 抛错）

- [ ] **Step 5: 全量类型检查**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx tsc --noEmit`
Expected: 零错误

- [ ] **Step 6: 检查点**

---

## Task 3: analysis.json + launch.ts enum 扩展

**Files:**
- Modify: `schema/__tests__/fixtures/imaudio-analysis.json`
- Modify: `mcp-imaudio/src/tools/launch.ts`

- [ ] **Step 1: analysis.json appName enum 扩展**

在 `schema/__tests__/fixtures/imaudio-analysis.json` 的 `launch_app` capability 里，把：
```json
        { "name": "appName", "type": "string", "enum": ["imaudio"] }
```
改为：
```json
        { "name": "appName", "type": "string", "enum": ["imaudio", "lightpoint", "smartcar"] }
```

- [ ] **Step 2: 验证 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('D:/IM/im-mcp-codeagent/schema/__tests__/fixtures/imaudio-analysis.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3: 验证 e2e system prompt 含新 enum**

Run: `cd D:/IM/im-mcp-codeagent/e2e-test-runner && python -c "from prompt_generator import generate_system_prompt_from_servers as g; p=g(); print('lightpoint' in p and 'smartcar' in p)"`
Expected: `True`

- [ ] **Step 4: launch.ts inputSchema enum 扩展**

在 `mcp-imaudio/src/tools/launch.ts` 把：
```typescript
        appName: z.enum(["imaudio"]),
```
改为：
```typescript
        appName: z.enum(["imaudio", "lightpoint", "smartcar"]),
```

- [ ] **Step 5: 类型检查 + build**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx tsc --noEmit && npm run build`
Expected: 零错误，dist/ 更新

- [ ] **Step 6: 检查点**

---

## Task 4: mock-adapter 测试（lightpoint/smartcar）

**Files:**
- Modify: `mcp-imaudio/tests/unit/mock-adapter.test.ts`

> mock-adapter.launchApp 已兼容任意 appName（返回 {success, targetPageId, appName}），无需改实现，只加测试覆盖新目标。

- [ ] **Step 1: 加 lightpoint/smartcar 测试**

在 `mcp-imaudio/tests/unit/mock-adapter.test.ts` 的 `describe("system: launch_app")` 里，追加：
```typescript
    it("launchApp supports lightpoint/smartcar", async () => {
      for (const app of ["imaudio", "lightpoint", "smartcar"]) {
        const result = await adapter.launchApp(app);
        expect(result.success).toBe(true);
        expect(result.appName).toBe(app);
        expect(result.targetPageId).toBeTruthy();
      }
    });
```

- [ ] **Step 2: 运行确认通过**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run tests/unit/mock-adapter.test.ts`
Expected: PASS（含新多目标测试）

- [ ] **Step 3: 全量测试**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npx vitest run`
Expected: 所有测试通过（app-page-uri + yunos-adapter-launch + mock-adapter + 已有的）

- [ ] **Step 4: 检查点**

---

## Task 5: 端到端验证（实机跳转）

**Files:** 无（运行验证）

- [ ] **Step 1: 确认 build 产物最新**

Run: `cd D:/IM/im-mcp-codeagent/mcp-imaudio && npm run build`
Expected: 无错误，dist/index.js 存在

- [ ] **Step 2: 确认 mcp-imaudio mock_mode: false（真实执行）**

确认 `mcp-imaudio/conf/config.yaml`：
```yaml
adapter:
  mock_mode: false
```

- [ ] **Step 3: 端到端 - lightpoint 跳转**

Run（用 venv python）:
```bash
cd D:/IM/im-mcp-codeagent/e2e-test-runner
echo "打开秀场" | "D:/ZZT/z-aip/.venv/Scripts/python.exe" interactive.py
```
Expected: LLM 调用 `launch_app(appName="lightpoint")` → 实机打开秀场页（用户观察确认）

- [ ] **Step 4: 端到端 - smartcar 跳转**

Run:
```bash
echo "打开smartcar" | "D:/ZZT/z-aip/.venv/Scripts/python.exe" interactive.py
```
Expected: LLM 调用 `launch_app(appName="smartcar")` → 实机打开 smartcar（用户确认）

- [ ] **Step 5: 回归 - imaudio 不破坏**

Run:
```bash
echo "打开imaudio" | "D:/ZZT/z-aip/.venv/Scripts/python.exe" interactive.py
```
Expected: launch_app("imaudio") 仍 SUCCESS（不回归）

- [ ] **Step 6: 用户确认实机反应 + 检查点**

---

## Self-Review

**1. Spec 覆盖**：
- APP_PAGE_URI 映射表 → Task 1 ✓
- yunos-adapter.launchApp 查映射（不硬编码）→ Task 2 ✓
- analysis.json appName enum 扩展 → Task 3 ✓
- launch.ts inputSchema → Task 3 ✓
- mock-adapter 兼容多 appName → Task 4 ✓（实现已兼容，加测试）
- 端到端 lightpoint/smartcar 实机跳转 → Task 5 ✓
- imaudio 不回归 → Task 5 Step 5 ✓
- 复用 sendlink（不新建 adb 命令）→ Task 2 用 execute("sendlink") ✓

**2. Placeholder 扫描**：无 TBD/TODO，所有 code step 含真实代码（基于读到的精确当前实现）。

**3. 类型一致性**：`resolvePageUri(appName): string | undefined`（Task 1）贯穿 Task 2（launchApp 查它）；`LaunchAppResult{success,targetPageId,appName}` 沿用现有；`APP_PAGE_URI` 的 3 个 key 与 analysis.json/launch.ts enum 一致（imaudio/lightpoint/smartcar）。

**已验证事实（grep 确认，无需执行前复核）**：
- `createYunosAdapter(adbConfig: AdbConfig): IAdapter` —— `yunos-adapter.ts:9`（Task 2 测试 import 正确）。
- `AdbConfig` 字段 `path` / `use_host` / `timeout_ms` —— `config.ts:5-8`（STUB_CONFIG 字段匹配）。
- `execute("sendlink", ...)` 签名 —— 当前 launchApp 已用，保持不变。
- mock-adapter.test.ts 顶层 `describe("MockAdapter")`，内部 `describe("system: launch_app")` 在 `:331`，变量名 `adapter` —— Task 4 追加位置正确。
