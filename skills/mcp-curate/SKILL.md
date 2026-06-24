---
name: mcp-curate
description: Enumerate MCP-ifiable capabilities and let the user pick which to generate (selection.json)
---

> 🌐 默认用中文与用户交互和输出；代码/命令/标识符保持英文。
> CLI：`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" curate <analysis.json> [--prd <prd.md>]`
> 若 `${SKILL_DIR}` 未展开，改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`。

# MCP Curate

After analyze, decide WHICH capabilities become MCP tools.

## Process
1. **Enumerate** (deterministic): `mcp-pipeline curate <analysis.json> [--prd <prd.md>]` → candidate table.
2. **Propose a subset** (your judgment, informed by the table + PRD): which capabilities are worth MCP-ifying now.
3. **Present the subset to the user and let them pick** (第一要义：用户选择). Do not write until the user chooses.
4. On the user's choice, **write `selection.json`** = `{ "selected": ["<cap.id>", ...] }` 到 `.mcp-pipeline/<app>/selection.json`（与 `analysis.json` 同目录）。随后 scaffold 须带 `--selection .mcp-pipeline/<app>/selection.json`，才会只生成被选中的能力。

## Rules
- Re-pick = edit `selection.json` + re-run the pipeline (generated files regenerate; `rpc/config.json` + `conf/config.yaml` preserved).
- PRD-only features absent from code: flag them, do not fabricate (MCP-ifying needs a wire).
