---
description: Launch the BRIDGE visual workbench (Electron) and run the in-app auto-pipeline that turns a YunOS HDT / Android app into an MCP suite
argument-hint: [app源码目录]
---

> 🌐 默认用中文与用户交互和输出（推理、解释、报告都用中文）；代码、命令、标识符、文件名保持英文。

# /mcp-pipeline

启动 **BRIDGE 可视化工作台**（本地 Electron 窗口）。工作台内置自动流水线（analyze→scaffold→generate→gates→build→test→register→verify→schema_preview→deploy），由其 control-server 自身驱动，**不需要在会话里手动跑 CLI 步骤**。本命令只负责“启动服务”。

## 执行步骤

1. `$ARGUMENTS` 为**可选**的 app 源码目录（例如 `./aipet`）。忽略 `--step`/`--from` 之类标志——那是 headless skill 模式的参数，可视化模式下不适用。
2. 在插件根目录运行启动器（启动器会 detach Electron 后立即返回，不会阻塞会话）：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/launch-workbench.mjs" $ARGUMENTS
   ```
   - 若 `${CLAUDE_PLUGIN_ROOT}` 未展开，改用加载本命令时显示的插件根目录路径。
   - 启动器会：按需构建 dist、解析 agent 后端（claude 优先、回退 codex）、以独立进程拉起 Electron 窗口。
3. 窗口打开后向用户说明：
   - **带了路径参数** → 「导入」面板的「源码目录」已预填该路径；请用户补全项目名与格式参考 Schema，点「导入并自动分析」即开跑流水线。
   - **未带参数** → 面板为空，请用户手动选择源码目录 / Schema / 项目名后导入。
4. 流水线结果在窗口内查看：完整 schema 见「机器可读产物 → 工具」tab，MCP server 见「MCP 调试」面板，本次产物文件夹路径见「流水线」完成横幅。

## 注意

- 本命令**只启动服务**；流水线由工作台自身驱动。不要在会话里重复跑 `cli/bin/mcp-pipeline.js` 步骤，那会与工作台的 state 冲突。
- 关闭 Electron 窗口即停止工作台及其子进程。
- 无界面的 headless 场景才走 `mcp-pipeline` skill 的 CLI 编排；可视化优先用本命令。
