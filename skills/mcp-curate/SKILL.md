---
name: mcp-curate
description: Use when analysis.json exists and the user must choose WHICH capabilities become MCP tools (writes selection.json). Runs after analyze, before scaffold --selection.
---

> 🌐 默认用中文与用户交互和输出；代码/命令/标识符保持英文。
> CLI：`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" curate <analysis.json> [--prd <prd.md>]`
> 若 `${SKILL_DIR}` 未展开，改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`。

# MCP Curate

After analyze, decide WHICH capabilities become MCP tools.

## 判断标准

大部分 app 暴露的能力远多于需要 MCP 化的。curate 决定**哪些**成为 tool——这是**用户的判断**，你只负责：用确定性命令枚举候选 → 基于候选表 + PRD propose 一个子集 → **交给用户拍板** → 用户选定后才写 `selection.json`。

- **用户选择优先**：你 propose 的子集只是建议，最终写什么由用户定。用户没选之前不写文件。
- **不 fabricate**：PRD 里提到、但代码里没有的 feature → flag 给用户，**绝不硬造** capability（MCP 化需要真实 wire，没代码就没 wire，造了下游也只能臆造 wire，违反 generate 的 Iron Law）。
- **可重选**：重跑只需改 `selection.json` + 再走 pipeline（生成物重建，`rpc/config.json` + `conf/config.yaml` 保留）。

## Process
1. **Enumerate** (deterministic): `mcp-pipeline curate <analysis.json> [--prd <prd.md>]` → candidate table.
2. **Propose a subset** (your judgment, informed by the table + PRD): which capabilities are worth MCP-ifying now.
3. **Present the subset to the user and let them pick** (第一要义：用户选择). Do not write until the user chooses.
4. On the user's choice, **write `selection.json`** = `{ "selected": ["<cap.id>", ...] }` 到 `.mcp-pipeline/<app>/selection.json`（与 `analysis.json` 同目录）。随后 scaffold 须带 `--selection .mcp-pipeline/<app>/selection.json`，才会只生成被选中的能力。

## Rules
- Re-pick = edit `selection.json` + re-run the pipeline (generated files regenerate; `rpc/config.json` + `conf/config.yaml` preserved).
- PRD-only features absent from code: flag them, do not fabricate (MCP-ifying needs a wire).
