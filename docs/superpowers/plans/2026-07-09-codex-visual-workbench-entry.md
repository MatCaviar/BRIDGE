# Codex Visual Workbench Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route Codex MCP pipeline requests to the existing BRIDGE Electron Workbench.

**Architecture:** Add one concise Codex-discoverable skill that delegates all startup behavior to the existing launcher. Keep the launcher, Workbench, Claude command, marketplace, and pipeline unchanged.

**Tech Stack:** Codex skills (Markdown/YAML), Node.js launcher, Python plugin validators, Codex plugin CLI.

## Global Constraints

- Modify at most two functional files.
- Preserve the unrelated deletion of `schema/mock-mcp-output.schema.json`.
- Do not modify Electron, pipeline, control-server, UI, Claude commands, or marketplace configuration.
- Do not fall back to the legacy text pipeline.

---

### Task 1: Add and deploy the Codex Workbench launcher skill

**Files:**
- Create: `skills/mcp-workbench/SKILL.md`
- Modify only if discovery testing proves necessary: `.codex-plugin/plugin.json`
- Test: existing skill/plugin validators and launcher smoke behavior

**Interfaces:**
- Consumes: `scripts/launch-workbench.mjs [source-directory]`
- Produces: Codex skill `mcp-workbench`

- [ ] **Step 1: Verify the failing baseline**

Confirm `skills/mcp-workbench/SKILL.md` is absent and record that the prior MCP pipeline invocation selected the legacy v0.1.8 text skill instead of launching Workbench.

- [ ] **Step 2: Write the minimal skill**

Create a concise skill whose trigger covers MCP pipeline, Android/YunOS-to-MCP generation, and visual Workbench requests. Its body must run exactly:

```powershell
node "<plugin-root>\scripts\launch-workbench.mjs" "<optional-source-directory>"
```

It must announce a possible first-build delay, allow a ten-minute command timeout, and report launcher failures without executing CLI pipeline stages.

- [ ] **Step 3: Validate skill and plugin**

Run:

```powershell
python D:\CodexHome\skills\.system\skill-creator\scripts\quick_validate.py skills\mcp-workbench
python D:\CodexHome\skills\.system\plugin-creator\scripts\validate_plugin.py .
```

Expected: both commands exit 0.

- [ ] **Step 4: Verify the launcher**

Run the existing launcher with the representative source:

```powershell
node scripts\launch-workbench.mjs D:\workspace\im-test\test2\mock-audio-android
```

Expected: exit 0, `BRIDGE 可视化工作台已启动`, and the supplied source path shown as the initial path.

- [ ] **Step 5: Refresh and verify the local plugin**

Use `update_plugin_cachebuster.py`, reinstall from marketplace `im-mcp-codeagent`, and verify `codex plugin list` reports the plugin installed and enabled with the new cachebuster.

- [ ] **Step 6: Commit and push**

Stage only the skill, cachebuster manifest change if any, design, and plan. Verify the unrelated schema deletion is unstaged. Commit, push `main`, then re-run final validation.
