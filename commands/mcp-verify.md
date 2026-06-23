---
description: Verify a generated MCP Server project (install + tsc + tools/call dry-run + rpc-bridge static readiness)
argument-hint: <project-dir>
---

# /mcp-verify

Run the deterministic `verify` command against the generated MCP Server project at `$ARGUMENTS` and report the results.

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js" verify --dir "$ARGUMENTS"
```

Then:

1. Parse the output. `verify` checks: `npm install` + `tsc --noEmit` zero-error, one no-required-param tool answers `tools/call` successfully, and the rpc bridge is statically ready (`yunos-adapter.ts` has no `throw "not implemented"`, `rpc-client.ts` has `RPC_URL`, `rpc-engine.ts` re-exports `@im/mcp-server-framework`).
2. If every check passes, report a concise PASS summary.
3. If any check fails, list each failing check verbatim from the output and stop — do not attempt fixes unless asked.

Do not modify the project. This is a read-only verification step.
