---
name: mcp-curate
description: Use when analysis.json exists and the user must choose WHICH capabilities become MCP tools (writes selection.json). Runs after analyze, before scaffold --selection.
---

> 🌐 默认用中文与用户交互和输出；代码/命令/标识符保持英文。
> CLI: `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" curate <analysis.json> [--prd <prd.md>]`
> If `${SKILL_DIR}` does not expand, use `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js` instead.

# MCP Curate

After analyze, decide WHICH capabilities become MCP tools.

## Judgment criteria

Most apps expose far more capabilities than need to be MCP-ified. curate decides **which** become tools — this is **the user's judgment**; you only: enumerate candidates with a deterministic command → propose a subset based on the candidate table + PRD → **hand it to the user to decide** → write `selection.json` only after the user picks.

- **User choice first**: the subset you propose is only a suggestion; what gets written is decided by the user. Do not write the file before the user chooses.
- **Do not fabricate**: a feature mentioned in the PRD but absent from the code → flag it to the user, **never fabricate** a capability (MCP-ifying needs a real wire; no code means no wire, and fabricating one forces the downstream step to invent wire, violating generate's Iron Law).
- **Re-pickable**: re-running is just editing `selection.json` + re-running the pipeline (generated files rebuild; `rpc/config.json` + `conf/config.yaml` are preserved).
- **Skip broken / vendor-blocked**: capabilities with `status:"broken"` (known no-op — e.g. CarPropertyManager.set / MediaController / AudioManager writes silently rejected by the Banma vendor layer) must NOT be MCP-ified — exposing a no-op as a tool deceives the agent. Flag them, don't include them.
- **Mechanism travels with the capability**: selection picks by `id` only; each capability's `mechanism` (aidl/media/carproperty/audio/caraudio/shell) + mechanism-specific fields stay with it and flow into `registry.json`. Selection never changes the mechanism.

## Process
1. **Enumerate** (deterministic): `mcp-pipeline curate <analysis.json> [--prd <prd.md>]` → candidate table.
2. **Propose a subset** (your judgment, informed by the table + PRD): which capabilities are worth MCP-ifying now.
3. **Present the subset to the user and let them pick** (first principle: user choice). Do not write until the user chooses.
4. On the user's choice, **write `selection.json`** = `{ "selected": ["<cap.id>", ...] }` to `.mcp-pipeline/<app>/selection.json` (same directory as `analysis.json`). scaffold must then be run with `--selection .mcp-pipeline/<app>/selection.json` so only the chosen capabilities are generated.

## Rules
- Re-pick = edit `selection.json` + re-run the pipeline (generated files regenerate; `rpc/config.json` + `conf/config.yaml` preserved).
- PRD-only features absent from code: flag them, do not fabricate (MCP-ifying needs a wire).
