---
name: mcp-test
description: Use when a generated MCP Server project exists (post-generate, around build) and business-scenario tests must be authored, run, and fixed. The auto-generated contract/mock tests only cover wiring; this adds real-behavior coverage.
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> CLI: `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...` (if `${SKILL_DIR}` does not expand, use `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js` instead). This skill mostly runs `npx vitest`/`npx tsc` directly (inside the generated project directory); the CLI is for cross-skill reuse.

# MCP Test

Generate comprehensive business scenario tests for the MCP Server project, run the full test suite, and fix any failures.

## Judgment criteria

scaffold auto-generates the registry/schema contract tests. They only verify "the analysis results made it into the generated artifacts" — they do not verify "this MCP suite is actually useful to a host agent". **The business scenario tests you write cover agent-facing tool behavior** — they require you to understand the business logic, parameter boundaries, safety interception, deferred behavior, and representative call data. This is what auto-tests cannot cover; it is where your judgment adds value.

**A good test = one that can find a real bug:**
- **Test the real tool contract, not internal guesses**: assert the names, params, enums, safety hints, deferred status, and return shape that `TOOL_SCHEMA` / MCP tools/list / tools/call expose to the upstream agent — not some internal adapter method that may not exist.
- **Use real representative data**: real gears (P/R/N/D), real page names, real boundary values — not toy values constructed just to pass the test.
- **Cover the paths where bugs actually happen**: whether state is still usable after error injection, whether the safety guard really blocks, numeric boundaries, inverse operations (navigate forward then go back).
- **Fix the root cause, not the symptom**: when a test fails, classify first (generated-code bug / test bug / schema error / type error), fix the root cause, do not tweak the test to accommodate it.

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
