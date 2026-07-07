---
description: Reference for the im-mcp-codeagent plugin — skills, CLI subcommands, MCP suite deliverables, and install / car-side prerequisites
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

# /mcp-help

Reference card for the **im-mcp-codeagent** plugin. Print this verbatim to the user.

## Skills (LLM reasoning steps)

| Skill | Purpose |
|-------|---------|
| `/mcp-analyze` | Scan a YunOS HDT app → `analysis.json` (capabilities, params, returns, safety, SDK calls) |
| `/mcp-generate` | Author `rpc/config.json` (op→wire-spec map) from `analysis.json` + app source |
| `/mcp-test` | Classify test failures in a generated server and produce fixes |

> Full-pipeline orchestration is handled by the visual workbench launched via the `/mcp-pipeline` command (its built-in auto-pipeline has replaced the headless 9-step orchestration). The skills above are for single-step manual invocation.

## CLI subcommands (deterministic)

Run via `node "${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js" <subcmd>`:

| Subcommand | Purpose |
|------------|---------|
| `validate` | Validate `analysis.json` against schema |
| `validate_config` | Validate `rpc/config.json` (schema + coverage + dispatchable) |
| `wire_check` | Verify config wire matches app proxy source(s) — bidirectional, multi-proxy |
| `scaffold` | Generate MCP Server project skeleton (+ rpc bridge, car-side deliverables) |
| `test` | Run tests and collect results |
| `build` | `npm install` + `tsc` |
| `register` | Append server to gateway config |
| `verify` | install + tsc + tools/list + tools/call dry-run + schema-first rpc readiness |
| `schema_preview` | Direct-project `analysis.json` (+`rpc/config.json` `_deferred`) → `tools-schema.json` — the primary agent-facing artifact, no build/server needed |

> `generate` is **not** a CLI subcommand — it is the `/mcp-generate` LLM skill step that produces `rpc/config.json`; the two config gates (`validate_config`, `wire_check`) gate it.

## Install prerequisites

1. **Plugin install** (local marketplace, `source: "./"`): the whole monorepo is the plugin. The `SessionStart` hook auto-runs `npm install` (framework + cli) and builds `cli/dist/cli.js` if missing — fails loud on error.
2. **Car-side prerequisites — owned by a colleague, needed for real-device runs:**
   - Build + install the car-side `RpcEngine.ts` (delivered by `scaffold` under `car-side/`).
   - Add the `page://<app>.yunos.com/rpcagent` manifest page to the device so `adb -host sendlink` can reach the engine.
   - `adb -host` must work against the device.
   - **ZebraAlfred must be running** to keep the device awake — otherwise the device sleeps and `sendlink` intermittently returns exit -1.

## Entry points

- `/mcp-pipeline [app-source-dir]` — launch the BRIDGE visual workbench (works with no args too; pick the directory inside the UI; the workbench runs the built-in auto-pipeline).
- `/mcp-verify <project-dir>` — verify a generated project.
