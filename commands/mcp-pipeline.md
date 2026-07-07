---
description: Launch the BRIDGE visual workbench (Electron) to turn a YunOS HDT / Android app into an MCP suite via the in-app auto-pipeline
argument-hint: [app source directory]
---

> 🌐 默认用中文与用户交互和输出（推理、解释、报告都用中文）；代码、命令、标识符、文件名保持英文。

# /mcp-pipeline

**The entire task is a single action: launch the visual workbench.** Do not plan a flow, do not search source code, do not run any CLI subcommand — the workbench drives the full analyze→scaffold→generate→gates→build→test→register→verify→schema_preview pipeline itself. With or without arguments, it is the same: launch first, then operate in the UI.

Run exactly this one command (run it verbatim with no args; the directory is picked inside the workbench):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/launch-workbench.mjs" $ARGUMENTS
```

- If `${CLAUDE_PLUGIN_ROOT}` does not expand, use the plugin root path shown when this command was loaded.
- The launcher resolves the agent backend (claude first, codex fallback) and opens a standalone Electron window; it returns once the window is up and does not block the session. On first launch, if `dist` is missing it builds first (see the next bullet).
- **The first launch triggers a build** (4 workspaces, ~2–5 min; later launches skip the build and open in seconds). Before running, tell the user "the first launch needs to build, please wait a few minutes"; and give this command **a long enough timeout (at least 600000 ms / 10 min) — do not kill it midway** — the launcher prints build progress in real time.
- If the launcher reports a build failure or stall (it auto-terminates after 3 min with no output or an 8 min timeout and prints the reason), **do not retry verbatim**: run `npm run workbench:build` manually in the plugin root to see the full error (common: a workspace tsc error, or missing deps), fix it, then re-run `/mcp-pipeline` (the build is skipped thereafter). If the error is `'tsc' is not recognized`, the plugin cache shipped without `node_modules` — run `npm install` in the plugin root first (see `docs/WORKBENCH-TROUBLESHOOTING.md` #5).

Once the window is open, tell the user:

- **With a path argument** → the import panel's source directory is pre-filled; the user fills in the project name and reference schema, then clicks 「导入并自动分析」 to start the pipeline.
- **Without an argument** → the panel is empty; the user picks the source directory, schema, and project name in the UI themselves. **Do not pick a source directory for the user — just launch the workbench and let them choose inside it.**

All pipeline artifacts live in the window: the full schema is under 「机器可读产物 → 工具」 (Machine-readable artifacts → Tools), the MCP server is in the 「MCP 调试」 (MCP debug) panel, and the path to this run's output folder is in the pipeline completion banner.

Closing the Electron window stops the workbench and its child processes. This command is only the entry point; the workbench does the work.
