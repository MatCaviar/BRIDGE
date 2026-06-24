---
name: mcp-test
description: Generate business scenario tests, run test suite, and fix failures for a generated MCP Server project
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> 本 skill 的 base dir = 加载时显示的路径；CLI 调用形式为 `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`（${SKILL_DIR} 即本 skill 的 base dir）。若 `${SKILL_DIR}` 未展开，改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`（CLAUDE_PLUGIN_ROOT 即插件根目录，CLI 在 `<根>/cli/bin`，勿加 `../../`）。本 skill 主要直接跑 `npx vitest` / `npx tsc`（在生成的项目目录内），CLI 形式供跨 skill 复用。

# MCP Test

Generate comprehensive business scenario tests for the MCP Server project, run the full test suite, and fix any failures.

## Input

The user runs `/mcp-test ./mcp-<app>` with the project directory path.

## Process

### Step 1: Analyze Generated Code

Read the generated project to understand:
1. `src/adapters/types.ts` — all adapter methods and DTO types
2. `src/adapters/mock-adapter.ts` — mock adapter state, error injection, control methods
3. `src/tools/<domain>.ts` — tool handlers per domain
4. `src/types/errors.ts` — error code constants
5. `tests/contract.test.ts` — existing contract tests (auto-generated)
6. `tests/mock-adapter.test.ts` — existing mock adapter tests (auto-generated)

### Step 2: Generate Business Scenario Tests

Create `tests/<domain>.test.ts` for each domain. These tests cover scenarios that require understanding of business logic and edge cases.

**Test categories per domain:**

#### A. Happy Path Tests
- Each tool's success path with valid inputs
- Verify response shape matches DTO type (field names and types)
- Verify `success: true` in response data

#### B. Edge Case Tests
- Empty string inputs for string params
- Boundary values for numeric params (min, max)
- Optional params provided vs omitted
- Multiple sequential calls (state accumulation, e.g., navigation stack depth)
- Reverse operations (navigate forward then go back)

#### C. Error Injection Tests
- `adapter.setError(method, error)` → handler returns `formatError` response
- Error propagation preserves error message
- State remains valid after error (subsequent calls succeed)

#### D. Safety Guard Integration Tests
- For `p_gear_required` tools: verify rejection when not parked
- For `p_gear_and_confirm` tools: verify rejection without confirmation
- For `p_gear_and_network` tools: verify rejection when hotspot off
- For `readonly` tools: verify no safety checks
- Verify `ignoreMode` bypass works for all safety levels

**Template per domain:**

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import type { IAdapter } from "../src/adapters/types.js";
import type { MockAdapterControl } from "../src/adapters/mock-adapter.js";
import { createAdapter } from "../src/adapters/index.js";
import { createSafetyGuard } from "@im/mcp-server-framework";

describe("Navigation tools", () => {
  let adapter: IAdapter;
  let control: MockAdapterControl;

  beforeEach(() => {
    ({ adapter, control } = createAdapter());
  });

  describe("navigate_to", () => {
    it("navigates to a page and returns current page", async () => {
      const result = await adapter.navigateToPage("settings");
      expect(result.success).toBe(true);
      expect(result.currentPage).toBe("settings");
    });

    it("accumulates navigation stack", async () => {
      await adapter.navigateToPage("page1");
      const result = await adapter.navigateToPage("page2");
      expect(result.stackDepth).toBe(3); // home + page1 + page2
    });

    it("propagates adapter errors", async () => {
      control.setError("navigateToPage", new Error("router error"));
      await expect(adapter.navigateToPage("test")).rejects.toThrow("router error");
    });
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
| **Generated code bug** | Test is correct, handler/adapter logic wrong | Fix the generated source code |
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

- [ ] Every adapter method has at least 2 tests (success + error injection)
- [ ] Every safety level has at least 1 integration test
- [ ] Edge cases covered for tools with numeric params (boundary values)
- [ ] Edge cases covered for tools with string params (empty, special chars)
- [ ] State accumulation tested where applicable (navigation stack, gear changes)
- [ ] All generated test files pass: `npx vitest run`
- [ ] TypeScript compiles: `npx tsc --noEmit`
- [ ] Coverage meets 80% threshold
