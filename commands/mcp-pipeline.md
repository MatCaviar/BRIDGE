---
description: Run the full MCP Server generation pipeline (analyze→scaffold→generate→gates→test→build→register→verify) for a YunOS HDT app
argument-hint: <app源码目录>
---

# /mcp-pipeline

Load and follow the **mcp-pipeline** skill to run the end-to-end pipeline that turns the YunOS HDT app at `$ARGUMENTS` into a production MCP Server.

Steps to perform:

1. Load the `mcp-pipeline` skill and follow its methodology exactly.
2. Treat `$ARGUMENTS` as the app source directory (e.g. `./aipet`).
3. Execute every pipeline step in order: validate → analyze (`/mcp-analyze`) → scaffold → generate (`/mcp-generate` + the `validate_config` / `wire_check` gates, retried until both pass) → test (`/mcp-test` on failure) → build → register → verify.
4. Track state in `.mcp-pipeline/<app>/state.json`; honor `--step`, `--from`, `--only`, `--batch` if the user passed them.
5. Stop and surface errors when a deterministic step fails (build, a gate after 3 retries, etc.) — do not silently continue.

The skill does the work; this command is only the entry point. Report a concise pass/fail summary at the end.
