---
name: mcp-workbench
description: Use when a user asks to run the MCP pipeline, turn a YunOS HDT or Android app into an MCP suite, open BRIDGE, or use the visual MCP Workbench.
---

# MCP Workbench

Launch the existing BRIDGE Electron Workbench. The Workbench owns the complete
analyze-to-verify pipeline and all user interaction.

## Launch

Tell the user that the first launch may build dependencies for several minutes.
Run the launcher with a timeout of at least ten minutes:

```powershell
node "<skill-directory>\..\..\scripts\launch-workbench.mjs" "<optional-source-directory>"
```

Resolve `<skill-directory>` from this loaded `SKILL.md`. Include the source
argument only when the user supplied an existing directory. The launcher
prefills that directory; without one, the Workbench opens an empty import panel.

After the launcher reports `BRIDGE 可视化工作台已启动`, tell the user to continue
in the Workbench window.

If launch fails, report the launcher error. Do not run individual pipeline CLI
stages as a fallback.
