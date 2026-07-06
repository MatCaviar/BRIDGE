---
description: Launch the BRIDGE visual workbench (Electron) to turn a YunOS HDT / Android app into an MCP suite via the in-app auto-pipeline
argument-hint: [app source directory]
---

> 🌐 默认用中文与用户交互和输出（推理、解释、报告都用中文）；代码、命令、标识符、文件名保持英文。

# /mcp-pipeline

**整个任务只有一个动作:启动可视化工作台。** 不要规划流程、不要搜索源码、不要运行任何 CLI 子命令 —— 工作台内部会自行驱动 analyze→scaffold→generate→gates→build→test→register→verify→schema_preview 全流程。带不带参数都一样:先启动,再在界面里操作。

立刻执行这一条命令(无参数时原样执行,工作台内再选目录):

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/launch-workbench.mjs" $ARGUMENTS
```

- `${CLAUDE_PLUGIN_ROOT}` 未展开时,改用本命令加载时显示的插件根路径。
- 启动器会自行构建 dist、解析 agent 后端(claude 优先,codex 兜底)、打开独立 Electron 窗口,并立即返回 —— 不阻塞当前会话。

窗口打开后告诉用户:

- **带了路径参数** → 导入面板的源码目录已预填;用户补上项目名和参考 schema,点「导入并自动分析」即开始流水线。
- **没带参数** → 面板为空,用户在 UI 里自行选源码目录、schema、项目名。**不要替用户找源码目录 —— 只管启动工作台,让他在里面选。**

流水线产物都在窗口内:完整 schema 在「机器可读产物 → 工具」,MCP server 在「MCP 调试」,本次产物文件夹路径在流水线完成横幅里。

关闭 Electron 窗口即停止工作台及其子进程。本命令只是入口,工作台干活。
