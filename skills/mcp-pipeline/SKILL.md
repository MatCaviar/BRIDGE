---
name: mcp-pipeline
description: "Use when turning a YunOS HDT or supported Android app into an MCP suite for a host codeagent: agent-facing function schemas, a runnable MCP Server, an RPC wire contract, car-side bridge artifacts, and verification evidence."
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> 本 skill 的 base dir = 加载时显示的路径；CLI 调用形式为 `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`（${SKILL_DIR} 即本 skill 的 base dir）。若 `${SKILL_DIR}` 未展开，改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`（CLAUDE_PLUGIN_ROOT 即插件根目录，CLI 在 `<根>/cli/bin`，勿加 `../../`）。

# MCP Pipeline

Orchestrate the end-to-end pipeline that turns a YunOS HDT or supported Android app into an **MCP suite** for Claude Code / Codex: agent-facing function schemas, a runnable MCP Server, an RPC wire contract, car-side bridge artifacts, and verification evidence. 用 `schema_preview <analysis.json> [<rpc/config.json>] --output tools-schema.json` 输出可注入上游 agent 的 schema 预览——这是上游模型理解工具的首要产物。

## 你的角色：协作者，不是按钮执行者

这条 pipeline 是**默认路径**，不是必须盲目照走的铁轨。确定性 CLI 保证每一步可复现，两个 gate（validate_config + wire_check）是**安全网**——拦下明确错误，但**不替代你的判断**。

**你有权、且被鼓励**：
- 在 analyze 后，若发现 app 特殊（无 dbus、全是 native、capability 异常多/少），**主动向用户说明并建议调整**（建议 curate、跳过某些步骤、或全部 defer 并解释后果），而非机械推进。
- 在 generate 的 gate retry 中，若 3 次仍失败，**停下来诊断根因**（analysis 漏了？proxy 没找全？capability 不走 RPC 模型？），而不是第 4 次硬试——fix root cause，不 fix symptom。
- 任一步发现上游产物有问题（如 analysis 的 sourceRef 全对不上），**回头修上游**而非带病推进；`state.json` 支持任意 `--from` 重入。
- **gate 全绿 ≠ 产物正确**。gate 是下限（schema/coverage/dispatchable/wire 格式）；**上限（wire 真实性、analysis 完整性、测试有效性）是你的判断**，gate 替你查不了。

## Run Modes

```
/mcp-pipeline ./aipet                    # Full auto
/mcp-pipeline ./aipet --step             # Step-by-step with confirmation
/mcp-pipeline ./aipet --from generate    # Resume from specific step
/mcp-pipeline ./aipet --only test        # Run single step only
/mcp-pipeline ./aipet --batch            # Batch process all apps
```

## Pipeline Steps

The pipeline is a state machine with 9 steps (8 deterministic/LLM phases + `schema_preview` as the final, mandatory agent-injection deliverable). Each step has a type (deterministic CLI or LLM Skill) and produces artifacts.

```
[validate] → [analyze] → (review) → (curate, optional) → [scaffold] → [generate]
    → (validate_config + wire_check, inline, retried until pass)
    → [test] → (fix if failed) → [build] → [register] → [verify] → [schema_preview] → [done]
```

> **Note on `validate_config` / `wire_check`**: These two gates are **inline verification sub-steps run by the host agent during the `generate` phase** — they are retried until both pass before the pipeline advances to `test`/`build`. They are **NOT** sequential linear pipeline phases. They appear in `StepName` / `ALL_STEPS` so the commands can record status into `state.json`, but they do not advance the linear progression on their own; the retry loop is agent-driven (per spec §4.4). The host agent runs them, reads failures, fixes `rpc/config.json` per the `/mcp-generate` methodology, and re-runs — the pipeline only moves forward once both report success.

### Step 1: Validate (Deterministic — CLI)

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate .mcp-pipeline/<app>/analysis.json
```

If `analysis.json` doesn't exist yet, skip to Step 2 (analyze). If it exists but fails validation, report errors and stop.

### Step 2: Analyze (LLM Reasoning — `/mcp-analyze` Skill)

Invoke the `/mcp-analyze` Skill with the app directory path. The Skill:
1. Scans the YunOS app source code
2. Identifies capabilities, params, returns, safety levels, SDK calls
3. Produces `.mcp-pipeline/<app>/analysis.json`

After the Skill completes, run validation:
```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate .mcp-pipeline/<app>/analysis.json
```

If validation fails, report the errors and ask the user to review the analysis.json.

In `--step` mode: Pause after this step and ask "Analysis complete. Review analysis.json before continuing? [y/n]"

**Optional:** run `/mcp-curate` to pick which capabilities become tools (writes `.mcp-pipeline/<app>/selection.json`); then scaffold with `--selection .mcp-pipeline/<app>/selection.json` generates only the chosen subset.

### Step 3: Scaffold (Deterministic — CLI)

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" scaffold .mcp-pipeline/<app>/analysis.json --output ./mcp-<app> [--selection .mcp-pipeline/<app>/selection.json]
```

Generates the project skeleton with templates and auto-generated files. Scaffold deterministically produces the agent-facing schema (`src/tools/schema.ts`), registry (`src/tools/registry.ts`), MCP server dispatch (`src/server.ts`), generalized adapter (`src/adapters/index.ts` with `rpcCall(op,args)`), RPC bridge (`src/rpc/*`), `src/executors/adb-executor.ts`, the car-side deliverables (`car-side/RpcEngine.ts`, `car-side/manifest-page.json`), and the `adb:` block in `conf/config.yaml`. You create `rpc/config.json` from scratch in the `generate` step (it is **not** scaffolded).

### Step 4: Generate (LLM Reasoning — `/mcp-generate` Skill) + config gates

Invoke the `/mcp-generate` Skill with the scaffolded project path. The Skill:
1. Reads `analysis.json` + the original app proxy/manager source (via each capability's `sourceRef`)
2. Creates `rpc/config.json` from scratch — the op→wire-spec map (`op` = `capability.id`); this is the host agent's ONLY judgment product this step. The schema, server, adapter, bridge, and all other source are already generated by scaffold — **do not edit them here**.

After the Skill produces `rpc/config.json`, run the two deterministic gates (the reliability spine). **Both must pass before proceeding to test/build:**

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate_config rpc/config.json --analysis .mcp-pipeline/<app>/analysis.json
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" wire_check rpc/config.json --proxy <path/to/app/proxy/Proxy.ts>
```

- `validate_config` — schema conformance + coverage (every capability has a matching `op`) + dispatchable (`constructDbusCall`/`constructNativeCall` runs against sample args without crashing, `${var}` and `stringify` correct).
- `wire_check` — 双向校验：正向（proxy→config）解析 `createMethodCallMessage("m") ... funcName: "f"` 比对 `constructDbusCall`；反向（config→proxy）确认每个非 `_deferred` dbus op 的 funcName 真实出现在 proxy 源码（拦臆造 wire）。app 跨多 proxy 时传多个 `--proxy`，对并集校验。详见 `/mcp-generate` 的「判断标准」。

**If either gate fails:** return to the `/mcp-generate` methodology — read the gate's error, fix the offending `rpc/config.json` entry, and re-run the gate. Retry up to 3 attempts; if still failing after 3, surface the gate errors to the user and stop (do NOT proceed to build). These two gates are inline sub-steps of the `generate` phase, retried until pass (see the note above the steps).

In `--step` mode: Pause after this step and ask "Generation complete. Review rpc/config.json before continuing? [y/n]"

### Step 5: Test (Deterministic run + LLM fix — CLI + `/mcp-test` Skill)

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" test --dir ./mcp-<app>
```

If tests pass, continue. If tests fail:
1. Invoke `/mcp-test` Skill to classify errors and generate fixes
2. Re-run tests
3. Repeat up to 3 fix cycles
4. If still failing after 3 cycles, report failures and stop for human intervention

### Step 6: Build (Deterministic — CLI)

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" build --dir ./mcp-<app>
```

Runs `npm install` + `tsc`. If build fails, report errors and stop.

### Step 7: Register (Deterministic — CLI)

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" register --dir ./mcp-<app> --gateway ./mcp-gateway
```

Appends the MCP Server to gateway config. If gateway directory doesn't exist, skip with a warning.

### Step 8: Verify (Deterministic — CLI)

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" verify --dir ./mcp-<app> --gateway ./mcp-gateway
```

Verifies connectivity and tool discovery. If verification fails, report what failed.

### Step 9: schema_preview (Deterministic — CLI) — **mandatory final deliverable, do NOT skip**

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" schema_preview .mcp-pipeline/<app>/analysis.json ./mcp-<app>/rpc/config.json --output .mcp-pipeline/<app>/tools-schema.json
```

Projects `analysis.json` (+ `rpc/config.json` `_deferred`) into `tools-schema.json` — **the primary artifact an upstream agent (Claude/Codex) consumes to understand the tool surface**: every tool's description, `inputSchema` (real wire-value enums, `examples`, bounds, `outputSchema`), and `executable` flag. It is a **pure projection of analysis** (no build/server run needed), so it can be regenerated any time analysis or `_deferred` changes. **This is part of the main flow, not an optional add-on** — the 8 steps above produce a runnable server, but without `tools-schema.json` the upstream host agent has no machine-readable tool surface to call against. Running it is how you hand the suite to the host codeagent.

## State Management

The pipeline tracks progress in `.mcp-pipeline/<app>/state.json`:

```json
{
  "app": "aipet",
  "appPath": "./aipet",
  "currentStep": "generate",
  "steps": {
    "validate": { "status": "completed", "timestamp": "2026-06-08T12:00:00Z", "output": null },
    "analyze": { "status": "completed", "timestamp": "2026-06-08T12:05:00Z", "output": ".mcp-pipeline/aipet/analysis.json" },
    "scaffold": { "status": "completed", "timestamp": "2026-06-08T12:06:00Z", "output": "./mcp-aipet" },
    "generate": { "status": "in_progress", "timestamp": "2026-06-08T12:10:00Z", "output": null }
  }
}
```

**Resume behavior:**
- `--from generate`: Skip completed steps, start from generate
- On failure: State records the failed step, resume re-runs from that step
- State file is created on first run and updated after each step

## Batch Mode

When `--batch` is provided, the pipeline processes multiple app directories:

1. Find all app directories matching the glob pattern
2. For each app, run the full pipeline
3. Skip apps with no `ts/` or `src/` directory (not a YunOS app)
4. Record pass/fail/skip for each app
5. Output summary at the end

```
Batch Report:
  aipet: all steps passed
  music: test failed (3/15 tests failing)
  settings: skipped (no source directory)
  Summary: 42 passed, 3 failed, 5 skipped
```

## Error Handling

| Error | Action |
|-------|--------|
| analysis.json validation fails | Stop, report errors, ask user to fix |
| `validate_config` fails (schema/coverage/dispatchable) | Return to `/mcp-generate` methodology: read gate error, fix `rpc/config.json`, re-run; up to 3 attempts, then stop |
| `wire_check` fails (wire ≠ proxy source) | Return to `/mcp-generate` methodology: read gate error, fix `rpc/config.json` entry, re-run; up to 3 attempts, then stop |
| TypeScript compilation fails | Auto-fix up to 3 attempts, then stop |
| Tests fail | Auto-fix via /mcp-test up to 3 cycles, then stop |
| Build fails | Stop, report errors |
| Gateway not found | Skip register/verify with warning |
| App source not found | Skip with warning in batch mode |

## Quality Checklist

Before reporting pipeline complete, verify:

- [ ] All 8 steps completed successfully
- [ ] **`schema_preview` run** — `tools-schema.json` produced (the primary upstream-agent artifact; not optional)
- [ ] `state.json` shows all steps as "completed"
- [ ] `rpc/config.json` passes both gates: `validate_config` (schema + coverage + dispatchable) and `wire_check` (wire matches proxy source)
- [ ] Generated schema/server/adapter remain schema-first: `src/tools/schema.ts` exposes `TOOL_SCHEMA`, `src/server.ts` dispatches by tool name, and `src/adapters/index.ts` routes real mode through `rpcCall(op,args)`
- [ ] TypeScript compiles with zero errors
- [ ] All tests pass
- [ ] Generated server starts and responds to health check
- [ ] Gateway config updated with new server entry
- [ ] **No capability lost to outdated wire assumptions** — positional multi-write / bare-string / multi-segment-read capabilities are wired via `writes`/`replyParts`, not deferred or excluded (per `/mcp-generate` Patterns B/C/D)
