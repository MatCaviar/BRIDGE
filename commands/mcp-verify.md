---
description: Verify a generated MCP Server project (install + tsc + tools/list + tools/call dry-run + schema-first rpc bridge readiness)
argument-hint: <project-dir>
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

# /mcp-verify

Run the deterministic `verify` command against the generated MCP Server project at `$ARGUMENTS` and report the results.

> ⚠️ 前提：`verify` 需要先生成构建产物（`dist/index.js`）。若项目尚未 `build`，`verify` 只会报告"缺构建产物"这一项错误，其余四项检查（install / tsc / tools-call / rpc-bridge）不会执行。请先完整跑一遍 `/mcp-pipeline`，或单独 `mcp-pipeline build <dir>` 后再 verify。

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js" verify --dir "$ARGUMENTS"
```

Then:

1. Parse the output. `verify` checks: `npm install` + `tsc --noEmit` zero-error, `tools/list` exposes callable business tools, `tools/call` dry-runs one safe tool successfully, and the schema-first rpc bridge is statically ready (`src/tools/schema.ts` exposes `TOOL_SCHEMA`, `src/server.ts` dispatches by tool name, `src/adapters/index.ts` routes real mode through `rpcCall(op,args)`, `src/rpc/rpc-client.ts` has `RPC_URL`, `src/rpc/rpc-engine.ts` re-exports the framework dispatch core).
2. If every check passes, report a concise PASS summary.
3. If any check fails, list each failing check verbatim from the output and stop — do not attempt fixes unless asked.

Do not modify the project. This is a read-only verification step.
