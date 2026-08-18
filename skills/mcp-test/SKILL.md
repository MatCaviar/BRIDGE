---
name: mcp-test
description: Use when a generated MCP Server project exists (post-generate, around build) and business-scenario tests must be authored, run, and fixed. The auto-generated contract/mock tests only cover wiring; this adds real-behavior coverage.
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> CLI：`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`（`${SKILL_DIR}` 未展开时改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`）。本 skill 主要直接跑 `npx vitest`/`npx tsc`（在生成的项目目录内），CLI 供跨 skill 复用。

# MCP Test

Generate comprehensive business scenario tests for the MCP Server project, run the full test suite, and fix any failures.

## 判断标准

scaffold 自动生成了 registry/schema contract test。它们只测"分析结果是否进入生成物"，不测"这个 MCP suite 是否真的对 host agent 有用"。**你写的 business scenario test 测 agent-facing 工具行为**——需要你理解业务逻辑、参数边界、安全拦截、deferred 行为和代表性调用数据。这是自动测试覆盖不到的，是你的判断价值所在。

**好测试 = 能发现真 bug**：
- **测真实工具契约，不测内部猜测**：断言 `TOOL_SCHEMA` / MCP tools/list / tools/call 暴露给上游 agent 的名字、参数、枚举、安全提示、deferred 状态和返回形态，而不是测试某个不存在的内部 adapter 方法。
- **用真实代表性数据**：真实档位（P/R/N/D）、真实页面名、真实边界值——不构造 toy 值只为过测。
- **覆盖会真出 bug 的路径**：错误注入后状态是否仍可用、安全 guard 是否真拦、数值边界、逆操作（导航前进再返回）。
- **fix root cause 不 fix symptom**：测试失败先分类（生成代码 bug / 测试 bug / schema 错 / 类型错），修根因，不调测试迁就。

## Input

The user runs `/mcp-test ./mcp-<app>` with the project directory path.

## Process

### Step 1: Analyze Generated Code

Read the generated project to understand:
1. `src/tools/schema.ts` — the function schema surface shown to upstream agents
2. `src/tools/registry.ts` — capability metadata, domains, and safety levels
3. `src/server.ts` — MCP tools/list + tools/call dispatch and safety guard wiring
4. `src/adapters/index.ts` — mock/real `rpcCall(op,args)` dispatch boundary
5. `src/rpc/*` and `rpc/config.json` — real wire dispatch contract, if authored
6. `tests/contract/registry.test.ts` — existing generated contract tests

### Step 2: Generate Business Scenario Tests

Create `tests/<domain>.test.ts` for each domain. These tests cover scenarios that require understanding of business logic and edge cases.

**Test categories per domain:**

#### A. Happy Path Tests
- Each selected tool's schema has the expected name, required inputs, enum values, and safety annotations
- Mock-mode `rpcCall(op,args)` succeeds for representative valid inputs
- `schema_preview` output agrees with `src/tools/schema.ts`

#### B. Edge Case Tests
- Empty string inputs for string params
- Boundary values for numeric params (min, max)
- Optional params provided vs omitted
- Multiple sequential calls (state accumulation, e.g., navigation stack depth)
- Reverse operations (navigate forward then go back)

#### C. Error Injection Tests
- Unknown tool names fail instead of passing silently
- Deferred tools listed in `rpc/config.json` are reported as non-executable and are not treated as working tools
- Bad required inputs or missing confirmation are rejected by the tool schema / safety path

#### D. Safety Guard Integration Tests
- For `p_gear_required` tools: verify rejection when not parked
- For `p_gear_and_confirm` tools: verify rejection without confirmation
- For `p_gear_and_network` tools: verify rejection when hotspot off
- For `readonly` tools: verify no safety checks
- Verify `ignoreMode` bypass works for all safety levels

**Template per domain:**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createAdapter } from "../src/adapters/index.js";
import { TOOL_SCHEMA } from "../src/tools/schema.js";
import { TOOL_REGISTRY } from "../src/tools/registry.js";

const config = {
  adapter: { mock_mode: true },
  adb: { path: "adb", use_host: true, timeout_ms: 10000 },
};

describe("navigation MCP tool surface", () => {
  const toolName = "navigate_to";

  it("exposes the tool schema the upstream agent will see", () => {
    const tool = TOOL_SCHEMA.find((t) => t.name === toolName);
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("navigate");
    expect(tool!.inputSchema).toMatchObject({
      type: "object",
      properties: expect.any(Object),
    });
  });

  it("has registry metadata consistent with the tool surface", () => {
    const meta = TOOL_REGISTRY.find((t) => t.id === toolName);
    expect(meta).toBeDefined();
    expect(meta!.safetyLevel).toMatch(/readonly|normal|p_gear_required|p_gear_and_confirm|p_gear_and_network/);
  });

  it("dispatches representative mock-mode calls through rpcCall(op,args)", async () => {
    const { adapter } = createAdapter(config);
    const result = await adapter.rpcCall(toolName, { page: "settings" });
    expect(result).toEqual(expect.objectContaining({ success: true }));
  });
});
```

### Step 3: Run Tests

Execute:
```bash
cd <project-dir> && npx vitest run
```

### Step 4: Fix Failures

If tests fail, classify the error:

| Error Type | Indicator | Action |
|-----------|-----------|--------|
| **Generated code bug** | Test is correct, schema/server/adapter dispatch wrong | Fix the generated source code |
| **Test bug** | Test expectation doesn't match analysis.json | Fix the test |
| **Schema mismatch** | analysis.json declared wrong type/param | Fix analysis.json, re-run scaffold for affected files |
| **TypeScript error** | tsc fails on generated code | Fix the type error in generated code |
| **Import error** | Module not found or wrong path | Fix the import path |

**Fix loop:**
1. Read the failing test output
2. Classify the error type
3. Fix the root cause (not the symptom)
4. Re-run tests
5. Repeat until all tests pass

### Step 5: Validate Coverage

```bash
npx vitest run --coverage
```

Target: 80%+ coverage across all source files. If coverage is below target, add tests for uncovered branches.

## Quality Checklist

Before completing, verify:

- [ ] Every selected tool has schema-surface assertions (name, description, required inputs, enum values, safety annotations)
- [ ] Representative mock-mode `rpcCall(op,args)` calls pass for each selected domain
- [ ] Deferred tools are tested as intentionally non-executable, not silently working
- [ ] Every safety level present in the app has at least 1 integration test
- [ ] Edge cases covered for tools with numeric params (boundary values)
- [ ] Edge cases covered for tools with string params (empty, special chars)
- [ ] Stateful behavior is tested where the app actually has stateful tools (navigation stack, gear changes)
- [ ] All generated test files pass: `npx vitest run`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Coverage meets 80% threshold
