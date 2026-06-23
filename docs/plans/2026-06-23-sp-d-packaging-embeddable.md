# SP-D：打包 + 可嵌入 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: 用 superpowers:subagent-driven-development 逐任务实现。Steps 用 `- [ ]` 跟踪。

**Goal:** 把 im-mcp-codeagent 做成装上即用、跨平台、双端、本地可装的 Claude Code（+Codex 镜像）插件。

**Architecture:** 照搬 superpowers/ecc/full-featured 实测模式——polyglot SessionStart hook 真 build dist + 幂等不吞错；skills 经 skill-base-relative 路径调 CLI；ecc 式显式 plugin.json；`.codex-plugin/` 镜像 + check-manifests 防漂移；本地 marketplace `source:"./"`；verify 增强 + 真机 smoke 脚本。

**Tech Stack:** Node CLI（tsc/ESM）、bash hook（polyglot run-hook.cmd）、JSON manifests、vitest。

**Spec:** `docs/specs/2026-06-23-sp-d-packaging-embeddable-design.md`（权威源）。

## Global Constraints

- **自包含**：framework 随 monorepo（`file:../framework`）；adb 在 `tools/`；车机引擎模板在 `cli/assets/`。整 monorepo 即插件。
- **不静默吞错**：hook 失败必 stderr + 非零。
- **跨平台**：hook 走 polyglot `run-hook.cmd`（Windows→Git Bash，Unix→sh）；CLI 纯 Node。
- **配置文件，禁止环境变量**（adb/config.yaml，不用 env）。
- **插件内无 LLM call**（SP-B §0 不变）。
- **不改生成器逻辑**（SP-B 成果不动）；只打包/接线/修 hook/补 manifest。
- 每个 task ≤3 文件；TDD（先写失败测试再实现）；非 git（用 vitest + tsc + 实测验证）。

---

## Task 1: hooks 跨平台重构（核心可靠性）

**Files:**
- Create: `hooks/run-hook.cmd`、`hooks/session-init.sh`
- Modify: `hooks/hooks.json`

**Interfaces:**
- Produces: SessionStart 经 polyglot wrapper 跑 `session-init.sh`，幂等 build `cli/dist/cli.js`，失败非零+stderr。

- [ ] **Step 1: 写失败测试** `cli/tests/hooks-build.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("SP-D hooks", () => {
  it("hooks.json invokes polyglot run-hook.cmd session-init.sh (no inline npm/tsc)", () => {
    const h = readFileSync(resolve(__dirname, "../../hooks/hooks.json"), "utf-8");
    expect(h).toContain("run-hook.cmd");
    expect(h).toContain("session-init.sh");
    expect(h).not.toMatch(/npm install/);
    expect(h).not.toMatch(/tsc --noEmit/);
  });
  it("session-init.sh builds dist (emit, not --noEmit) and fails loud", () => {
    const s = readFileSync(resolve(__dirname, "../../hooks/session-init.sh"), "utf-8");
    expect(s).toContain("CLAUDE_PLUGIN_ROOT");
    expect(s).toMatch(/npx tsc( |")/);
    expect(s).not.toContain("--noEmit");
    expect(s).toMatch(/dist\/cli\.js/);
    expect(s).not.toMatch(/2>\/dev\/null/);
    expect(s).toMatch(/exit 1|set -e/);
  });
});
```
- [ ] **Step 2: 确认 FAIL**：`cd cli && npx vitest run tests/hooks-build.test.ts`。
- [ ] **Step 3: 创建 `hooks/run-hook.cmd`**（polyglot，照搬 full-featured + Windows fallback）：
```
: << 'CMDBLOCK'
@echo off
REM Polyglot: runs .sh cross-platform. Usage: run-hook.cmd <script.sh> [args]
set "BASH="
for /f "delims=" %%G in ('where bash 2^>nul') do (set "BASH=%%G" & goto :found)
if exist "C:\Program Files\Git\bin\bash.exe" set "BASH=C:\Program Files\Git\bin\bash.exe"
:found
if not defined BASH (echo [im-mcp] bash not found on PATH or Git install dir >&2 & exit /b 1)
"%BASH%" -l "%~dp0%~1" %2 %3 %4 %5
exit /b
CMDBLOCK
# Unix shell runs from here
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT_NAME="$1"; shift
"${SCRIPT_DIR}/${SCRIPT_NAME}" "$@"
```
- [ ] **Step 4: 创建 `hooks/session-init.sh`**：
```bash
#!/bin/bash
# SP-D: 幂等就绪 framework + cli，并 build dist（emit）。失败必非零+stderr。
set -euo pipefail
ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # 脚本在 <ROOT>/hooks/
fi
echo "[im-mcp] session-init at $ROOT"

install_if_needed() {
  local dir="$1"
  if [ ! -d "$dir/node_modules" ]; then
    echo "[im-mcp] npm install $dir"
    (cd "$dir" && npm install --no-fund --no-audit) || { echo "[im-mcp] npm install failed: $dir" >&2; exit 1; }
  fi
}
install_if_needed "$ROOT/framework"
install_if_needed "$ROOT/cli"

if [ ! -f "$ROOT/cli/dist/cli.js" ]; then
  echo "[im-mcp] building cli/dist"
  (cd "$ROOT/cli" && npx tsc) || { echo "[im-mcp] tsc build failed" >&2; exit 1; }
fi
echo "[im-mcp] ready"
```
- [ ] **Step 5: 改 `hooks/hooks.json`**：
```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "\"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd\" session-init.sh" } ] }
    ]
  }
}
```
- [ ] **Step 6: 确认 PASS + tsc**：`cd cli && npx vitest run tests/hooks-build.test.ts && npx tsc --noEmit`。
- [ ] **Step 7: 实测（记录到报告）**：`CLAUDE_PLUGIN_ROOT=D:/IM/im-mcp-codeagent bash hooks/session-init.sh` 跑一次确认 `cli/dist/cli.js` 生成；再跑确认幂等（不重 build）。

---

## Task 2: skills 调用改 skill-base-relative（核心可靠性②）

**Files:**
- Modify: `skills/mcp-analyze/SKILL.md`、`skills/mcp-generate/SKILL.md`、`skills/mcp-pipeline/SKILL.md`、`skills/mcp-test/SKILL.md`
- Create: `scripts/rewrite-cli-invocation.sh`（批量替换 + 校验）

**Interfaces:**
- Produces: 4 skill 内可执行裸 `mcp-pipeline <subcmd>` → `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd>`；文首注明 SKILL_DIR = 加载时显示的 base dir。

- [ ] **Step 1: T0 实测（de-risk）**：`node "D:/IM/im-mcp-codeagent/skills/mcp-pipeline/../../cli/bin/mcp-pipeline.js" --help` 应正常输出（先 `cd cli && npx tsc` 确保 dist）。记录到报告。
- [ ] **Step 2: 写校验测试** `cli/tests/skills-invocation.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
const SKILLS = ["mcp-analyze", "mcp-generate", "mcp-pipeline", "mcp-test"];
describe("SP-D skills invocation", () => {
  for (const s of SKILLS) {
    it(`${s} uses skill-base-relative CLI path`, () => {
      const md = readFileSync(resolve(__dirname, `../../skills/${s}/SKILL.md`), "utf-8");
      expect(md).toContain("../../cli/bin/mcp-pipeline.js");
      const bare = md.match(/(^|[^\`])mcp-pipeline (validate|scaffold|generate|test|build|register|verify|validate_config|wire_check)\b/g);
      expect(bare ?? []).toEqual([]);
    });
  }
});
```
- [ ] **Step 3: 确认 FAIL**。
- [ ] **Step 4: 批量替换**（sed 半自动 + 人工核对）：每个 SKILL.md frontmatter 后加 `> 本 skill base dir = 加载时显示路径；CLI = \`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js"\`（下文 $CLI）。`；可执行 `mcp-pipeline <subcmd> ...` → `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`。
- [ ] **Step 5: 确认 PASS + tsc**。
- [ ] **Step 6: grep 兜底**：`grep -rnE "(^|[^\`])mcp-pipeline (validate|scaffold|generate|test|build|register|verify|validate_config|wire_check)" skills/ | grep -v '../../cli/bin'` → 应空（或仅注释）。

---

## Task 3: `.claude-plugin/plugin.json` 对齐 ecc 显式

**Files:**
- Modify: `.claude-plugin/plugin.json`
- Create: `cli/tests/manifest.test.ts`

- [ ] **Step 1: 写失败测试** `cli/tests/manifest.test.ts`：
```typescript
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
const readPlugin = () => JSON.parse(readFileSync(resolve(__dirname, "../../.claude-plugin/plugin.json"), "utf-8"));
describe("SP-D claude manifest", () => {
  it("declares skills + commands + hooks explicitly (ecc style)", () => {
    const p = readPlugin();
    expect(p.name).toBe("im-mcp-codeagent");
    expect(p.skills).toEqual(["./skills/"]);
    expect(p.commands).toEqual(["./commands/"]);
    expect(p.hooks).toBe("./hooks/hooks.json");
    expect(p.defaultEnabled).toBe(true);
  });
  it("has homepage + repository + version", () => {
    const p = readPlugin();
    expect(typeof p.version).toBe("string");
    expect(p.homepage).toBeTruthy();
    expect(p.repository).toBeTruthy();
  });
});
```
- [ ] **Step 2: 确认 FAIL**（当前 skills 是字符串非数组；无 commands）。
- [ ] **Step 3: 改 `.claude-plugin/plugin.json`**：
```json
{
  "name": "im-mcp-codeagent",
  "displayName": "IM MCP CodeAgent",
  "version": "0.1.0",
  "description": "Auto-generate controllable MCP Servers from YunOS HDT apps: analyze → scaffold → generate → gates → build. Car-side RPC bridge, deterministic config gates, dual-end (Claude Code + Codex).",
  "author": { "name": "IM Cockpit Team" },
  "license": "MIT",
  "homepage": "https://github.com/im-cockpit/im-mcp-codeagent",
  "repository": "https://github.com/im-cockpit/im-mcp-codeagent",
  "keywords": ["yunos", "automotive", "mcp", "claude-code", "codex", "rpc-bridge"],
  "skills": ["./skills/"],
  "commands": ["./commands/"],
  "hooks": "./hooks/hooks.json",
  "defaultEnabled": true
}
```
- [ ] **Step 4: 确认 PASS + tsc**。

---

## Task 4: `.codex-plugin/plugin.json` 镜像

**Files:**
- Create: `.codex-plugin/plugin.json`
- Modify: `cli/tests/manifest.test.ts`（追加）

- [ ] **Step 1: 查 Codex 规范**——读 `plugin-creator` skill（`.codex-plugin/plugin.json` 范例）确认字段；记录到报告。
- [ ] **Step 2: 写失败测试**（manifest.test.ts 追加）：
```typescript
describe("SP-D codex manifest mirror", () => {
  it(".codex-plugin/plugin.json mirrors skills/commands/hooks", () => {
    const c = JSON.parse(readFileSync(resolve(__dirname, "../../.codex-plugin/plugin.json"), "utf-8"));
    expect(c.name).toBe("im-mcp-codeagent");
    expect(JSON.stringify(c)).toContain("./skills/");
    expect(JSON.stringify(c)).toContain("./commands/");
  });
});
```
- [ ] **Step 3: 确认 FAIL**。
- [ ] **Step 4: 创建 `.codex-plugin/plugin.json`**（字段以 Step 1 Codex 规范为准；镜像 Claude Code 路径）：
```json
{
  "name": "im-mcp-codeagent",
  "version": "0.1.0",
  "description": "Auto-generate controllable MCP Servers from YunOS HDT apps (Claude Code + Codex).",
  "author": { "name": "IM Cockpit Team" },
  "license": "MIT",
  "skills": ["./skills/"],
  "commands": ["./commands/"],
  "hooks": "./hooks/hooks.json"
}
```
- [ ] **Step 5: 确认 PASS + tsc**。

---

## Task 5: `check-manifests` 校验脚本（防漂移）

**Files:**
- Create: `scripts/check-manifests.js`
- Modify: `cli/package.json`（加 check-manifests script）
- Create: `cli/tests/check-manifests.test.ts`

- [ ] **Step 1: 写失败测试**：
```typescript
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";
describe("check-manifests", () => {
  it("exits 0 + 'manifests agree' when claude/codex agree", () => {
    const r = execFileSync("node", [resolve(__dirname, "../../scripts/check-manifests.js")], { cwd: resolve(__dirname, "../.."), encoding: "utf-8" });
    expect(r).toContain("manifests agree");
  });
});
```
- [ ] **Step 2: 确认 FAIL**。
- [ ] **Step 3: 创建 `scripts/check-manifests.js`**：读两个 plugin.json，比对 skills/commands/hooks 路径一致；不一致 exit(1) + 打印差异；一致打印 `manifests agree`。
- [ ] **Step 4: cli/package.json scripts 加** `"check-manifests": "node ../scripts/check-manifests.js"`。
- [ ] **Step 5: 确认 PASS + tsc + 手动** `node scripts/check-manifests.js`。

---

## Task 6: 本地 marketplace

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Modify: `cli/tests/manifest.test.ts`（追加）

- [ ] **Step 1: 写失败测试**（manifest.test.ts 追加）：
```typescript
describe("SP-D marketplace", () => {
  it("local marketplace lists im-mcp-codeagent source ./", () => {
    const m = JSON.parse(readFileSync(resolve(__dirname, "../../.claude-plugin/marketplace.json"), "utf-8"));
    expect(m.name).toBeTruthy();
    expect(m.plugins).toHaveLength(1);
    expect(m.plugins[0].name).toBe("im-mcp-codeagent");
    expect(m.plugins[0].source).toBe("./");
  });
});
```
- [ ] **Step 2: 确认 FAIL**。
- [ ] **Step 3: 创建 `.claude-plugin/marketplace.json`**：
```json
{
  "name": "im-mcp-marketplace",
  "description": "IM Cockpit MCP CodeAgent 插件市场（本地/团队）",
  "owner": { "name": "IM Cockpit Team" },
  "plugins": [
    { "name": "im-mcp-codeagent", "description": "Auto-generate controllable MCP Servers from YunOS HDT apps.", "version": "0.1.0", "source": "./" }
  ]
}
```
- [ ] **Step 4: 确认 PASS + tsc**。

---

## Task 7: verify 增强（install + tsc + tools/call dry-run + rpc 桥静态就绪）

**Files:**
- Modify: `cli/src/commands/verify.ts`
- Create/Modify: `cli/tests/verify.test.ts`

**Interfaces:**
- Consumes: 现有 `discoverTools`；新增 `runInstallAndTypecheck(dir)`、`callReadonlyTool(...)`、`assertRpcBridgeReady(projectDir)`。
- Produces: verify 多报 3 项（install+tsc 零错 / 一个无必填参工具 tools/call 成功 / rpc 桥静态就绪）。

- [ ] **Step 1: 写失败测试** `cli/tests/verify.test.ts`：对 scaffold 出的样例 server（`schema/__tests__/fixtures/valid-analysis.json` → 临时目录 build）跑 verify，断言无 errors + 输出含 install/tsc/calldry/bridge 通过。
- [ ] **Step 2: 确认 FAIL**（新检查未实现）。
- [ ] **Step 3: 改 `cli/src/commands/verify.ts`**：
  - `runInstallAndTypecheck(projectDir)`：`spawnSync("npm",["install"],{cwd})` + `spawnSync("npx",["tsc","--noEmit"],{cwd})`；非零 push error。
  - readonly tools/call：`discoverTools` 后，挑一个无必填参工具 `sendJsonRpc(child, 3, "tools/call", {name, arguments:{}})`；等响应；`result.isError` truthy 或无 result → push error。
  - `assertRpcBridgeReady(projectDir)`：静态检查生成产物——`src/adapters/yunos-adapter.ts` 无 `throw "not implemented"`、`src/rpc/rpc-client.ts` 含 `RPC_URL`、`src/rpc/rpc-engine.ts` 含 `@im/mcp-server-framework`（复用 SP-B 回归断言）。本地确定性。
  - 三项接入 `verifyCommand` errors 流。
- [ ] **Step 4: 确认 PASS + tsc + 全量不回归**：`cd cli && npx vitest run tests/verify.test.ts && npx tsc --noEmit && npx vitest run`。

---

## Task 8: slash commands（高度集成）

**Files:**
- Create: `commands/mcp-pipeline.md`、`commands/mcp-verify.md`、`commands/mcp-help.md`

- [ ] **Step 1: 创建 3 个 command markdown**（Claude Code slash command = 简短 prompt）：
  - `mcp-pipeline.md`：`/mcp-pipeline <app源码目录>` → 加载 mcp-pipeline skill 执行全流程。
  - `mcp-verify.md`：`/mcp-verify <project-dir>` → 跑 `node "${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js" verify --dir <project-dir>`。
  - `mcp-help.md`：插件能力清单（4 skills + CLI subcommands + 安装/装车前置）。
- [ ] **Step 2: 核对** commands 在 plugin.json `commands:["./commands/"]` 下（manifest.test.ts 已覆盖声明）。

---

## Task 9: 真机 smoke 脚本（就绪，实跑待 P1-T8）

**Files:**
- Create: `scripts/smoke-real-device.sh`、`docs/smoke-real-device.md`

- [ ] **Step 1: 创建 `scripts/smoke-real-device.sh`**：参数 `<generated-server-dir> <fixture>`；adb devices 在线 → sendlink rpcagent → 经 generated server 的 soundstage read/set → 对比期望。每步前置检查 + 失败非零。脚本头 `# BLOCKED on P1-T8（同事装车 RpcEngine.ts）`。
- [ ] **Step 2: 创建 `docs/smoke-real-device.md`**：前置（装车 RpcEngine.ts + manifest page、adb -host、ZebraAlfred 保活）+ 运行命令 + 期望 + 排错。
- [ ] **Step 3: 标注** 实跑待 P1-T8 解阻。

---

## Task 10: 回归 + 装后 e2e 验证

**Files:** 无（运行验证）

- [ ] **Step 1: SP-B 全量回归**：`cd cli && npx vitest run` 全绿（130+ + SP-D 新增）；`npx tsc --noEmit` 零错。
- [ ] **Step 2: 生成器零 app 字面量不变**：`grep -riE "imaudio|soundstage" cli/src/generators/ cli/assets/ cli/src/commands/validate-config.ts cli/src/commands/wire-check.ts | grep -viE "//|\.test\.|sample|template"` → 空。
- [ ] **Step 3: 装后 e2e（模拟全新装）**：拷 repo 到 `_sp_d_install/`；`CLAUDE_PLUGIN_ROOT=_sp_d_install bash _sp_d_install/hooks/session-init.sh` → dist build；`node _sp_d_install/cli/bin/mcp-pipeline.js --help` 正常；`node ... scaffold <fixture> --output _sp_d_install/_out && (cd _sp_d_install/_out && npm install && npx tsc --noEmit)` 零错；`node ... verify --dir _sp_d_install/_out` 全绿。
- [ ] **Step 4: check-manifests 过**：`node scripts/check-manifests.js`。
- [ ] **Step 5: 跨平台 hook 核对**：`run-hook.cmd` polyglot 两段在；`session-init.sh` 在 Git Bash 跑通（手动记录）。
- [ ] **Step 6: 验收矩阵**：逐条对照 spec §8，PASS/FAIL + 证据。
- [ ] **Step 7: 清理** `rm -rf _sp_d_install _sp_d_verify_sample`（gate 拦则记录手动清）。

---

## 验收 = spec §8（T10 Step 6 出矩阵）

## 风险 = spec §9
T0（Task2 Step1）实测 skill-base-relative 解析；Codex 字段（Task4 Step1 查 plugin-creator）；Windows Git Bash 路径（run-hook.cmd 已 `where bash` fallback）；hook 失败降级（skill 给手动 build 指引）。
