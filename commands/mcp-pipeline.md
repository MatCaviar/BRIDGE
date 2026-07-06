---
description: Launch the BRIDGE visual workbench (Electron) to turn a YunOS HDT / Android app into an MCP suite via the in-app auto-pipeline
argument-hint: [app source directory]
---

> 🌐 默认用中文与用户交互和输出（推理、解释、报告都用中文）；代码、命令、标识符、文件名保持英文。

# /mcp-pipeline

Launch the **BRIDGE visual workbench** — a local Electron window whose built-in auto-pipeline (analyze→scaffold→generate→gates→build→test→register→verify→schema_preview→deploy) turns the YunOS HDT app at `$ARGUMENTS` into a ready-to-run MCP suite: agent-facing function schemas, the MCP Server that exposes them, and the bridge assets needed to actually drive the app/device instead of returning throw-stub mocks. The workbench's control-server drives the pipeline itself; **this command only starts the service** — do not run the headless CLI steps in the session.

Steps to perform:

1. Treat `$ARGUMENTS` as an **optional** app source directory (e.g. `./aipet`). Ignore `--step` / `--from` / `--only` / `--batch` — those belong to the headless `mcp-pipeline` skill and do not apply to the visual workbench.
2. Run the launcher from the plugin root (it detaches Electron and returns immediately, so it will not block the session):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/launch-workbench.mjs" $ARGUMENTS
   ```
   If `${CLAUDE_PLUGIN_ROOT}` does not expand, use the plugin root path shown when this command was loaded. The launcher builds dist on first run, resolves the agent backend (claude preferred, codex fallback), and opens an independent Electron window.
3. **Step 2 is your only action.** Do not search the filesystem for app source, do not invoke the `mcp-pipeline` skill, and do not run `cli/bin/mcp-pipeline.js` — the workbench drives the pipeline and doing so would conflict with its state.
4. After the window opens, tell the user:
   - **With a path argument** → the 导入 panel's source directory is pre-filled; the user fills in the project name and reference schema, then clicks 导入并自动分析 to start the pipeline.
   - **Without a path argument** → the panel is empty; the user selects the source directory, schema, and project name manually inside the UI. **Do not try to locate a source directory for them — just launch the workbench and let them pick inside it.**
5. Pipeline results live inside the window: the full schema under 机器可读产物 → 工具, the MCP server under MCP 调试, and this run's artifact folder path in the 流水线 completion banner.

The workbench does the work; this command is only the entry point. Closing the Electron window stops the workbench and its child processes.
