---
description: Verify a generated MCP Server project (install + tsc + tools/list + tools/call dry-run + schema-first rpc bridge readiness)
argument-hint: <project-dir>
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

# /mcp-verify

Run the deterministic `verify` command against the generated MCP Server project at `$ARGUMENTS` and report the results.

> ⚠️ Prerequisite: `verify` requires the build artifact (`dist/index.js`) to exist first. If the project has not been `build`-ed, `verify` will only report the single "missing build artifact" error and the other four checks (install / tsc / tools-call / rpc-bridge) will not run. Run the full `/mcp-pipeline` first, or `mcp-pipeline build <dir>` separately, before verifying.

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js" verify --dir "$ARGUMENTS"
```

Then:

1. Parse the output. `verify` checks: `npm install` + `tsc --noEmit` zero-error, `tools/list` exposes callable business tools, `tools/call` dry-runs one safe tool successfully, and the schema-first rpc bridge is statically ready (`src/tools/schema.ts` exposes `TOOL_SCHEMA`, `src/server.ts` dispatches by tool name, `src/adapters/index.ts` routes real mode through `rpcCall(op,args)`, `src/rpc/rpc-client.ts` has `RPC_URL`, `src/rpc/rpc-engine.ts` re-exports the framework dispatch core).
2. If every check passes, report a concise PASS summary.
3. If any check fails, list each failing check verbatim from the output and stop — do not attempt fixes unless asked.

Do not modify the project. This is a read-only verification step.
