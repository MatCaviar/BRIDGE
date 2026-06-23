# SP-D：打包 + 可嵌入 设计

**日期**: 2026-06-23
**状态**: 设计已起草，待 grill + writing-plans
**定位**: im-mcp-codeagent 插件演进的第 4 个子项目（SP-D）。目标 bar：把当前 workspace 做成**真正可安装、可嵌入、装上即用**的 Claude Code（+ Codex 镜像）插件——可靠（装后 CLI 必可用）、高度集成（skills/commands/hooks 原生）、可泛化（任意机器/任意 app）。
**前置**: SP-B 已让生成器产出可控、app 无关的 server + 确定性闸门。SP-D 解决"插件本身能否被装上、装上能否跑"。

**构建方式参考**（实测 `~/.claude/plugins/` 下的 superpowers / ecc / full-featured-example）：
- `plugin.json` = 元数据 + 可选显式 `"skills":["./skills/"]`/`"commands":["./commands/"]`/`"mcpServers":{}`（ecc 用显式；superpowers 纯元数据靠自动发现）。
- 插件资产路径用 `${CLAUDE_PLUGIN_ROOT}/...`（full-featured 的 mcpServers 即如此）。
- 本地 marketplace = 一个含 `.claude-plugin/marketplace.json` 的目录；plugin `source` 可为 `"./"`（本地目录，无需 git URL/公网）。
- 跨平台 hook = 多语言 `run-hook.cmd`（Windows 走 Git Bash，Unix 走 sh）+ `*.sh`。

---

## 0. 产品定位（再次明确）

插件**内部无 LLM call**（SP-B §0 不变）。插件 = ① 方法论（skills/SKILL.md）+ ② 确定性 CLI（`@im/mcp-pipeline-cli`，纯 Node）+ ③ 框架（`@im/mcp-server-framework`）+ ④ 资产（templates/adb/config 范例）。宿主 agent（Claude Code/Codex，本身即 LLM）按方法论执行，CLI 干确定性重活。

SP-D 范围：让这整套**作为插件被装上后立即可靠运行**——CLI 自带可用、跨平台、双端 manifest、本地可装、装后一键验证。**不**含：公网发布、Codex 运行时真机验证（见 §7）。

---

## 1. 背景与 gap（实测当前 `.claude-plugin/` + `hooks/` + `cli/`）

当前 `.claude-plugin/plugin.json`：`name/displayName/version/skills:"./skills/"/hooks:"./hooks/hooks.json"/defaultEnabled:true`。**但装到别的机器上 `/mcp-pipeline` 会失败**，三个根因：

1. **SessionStart hook 只 `tsc --noEmit`（类型检查，不产 dist）**，而 `cli/bin/mcp-pipeline.js` 要 `import("../dist/cli.js")` → 全新安装时 dist 缺失 → CLI 崩 `Cannot find module`。
2. **skills 用裸命令 `mcp-pipeline ...`，但插件没把它暴露到 PATH**（plugin.json 不声明 CLI，无 global link）。
3. **hook 静默吞错**（`2>/dev/null || true`）+ 每次 session `npm install` 两遍（慢）。
4. **无 `.codex-plugin/`、无 marketplace.json** → Codex 端缺、不可安装发现。
5. hook 命令是单行 `cd ... && ...`，**Windows 上脆弱**（`;`/`cd` 链）。

→ SP-D：照搬 exemplar 的可靠模式，确定性消除以上。

---

## 2. 核心原则

| 原则 | 落实 |
|------|------|
| **可靠（装上即用）** | SessionStart hook **真 build（emit dist）**且幂等（dist 在则跳过）+ **不静默吞错**（失败则显式报告）；CLI 经 `${CLAUDE_PLUGIN_ROOT}` 绝对路径调用（不依赖 PATH/全局 link）。 |
| **自包含** | framework 随 monorepo 装（`file:../framework`，hook 跑 `npm install`）；adb 在 `tools/`；车机引擎模板打包进 `cli/assets/`（SP-B 已做）。整 monorepo 即插件，拷到任意机器可装。 |
| **跨平台** | hook 用 polyglot `run-hook.cmd`（Windows→Git Bash，Unix→sh）；CLI 是纯 Node。 |
| **双端（Claude Code + Codex）** | 共享 `skills/`+`cli/`+`framework/`；Claude Code 用 `.claude-plugin/`，Codex 用 `.codex-plugin/` 镜像；一个 `check-manifests` 校验防漂移。 |
| **高度集成** | plugin.json 显式声明 skills/commands；关键流程提供 slash commands（`commands/*.md`）；SessionStart 自动就绪。 |
| **可泛化** | 任意机器（自包含）+ 任意 app（skills/CLI 已 app 无关，SP-B）+ 双宿主。 |

---

## 3. 架构 / 安装后数据流

```
用户：/plugin marketplace add <本地路径或 git>  →  /plugin install im-mcp-codeagent
  → Claude Code 把插件装到 ~/.claude/plugins/，置 CLAUDE_PLUGIN_ROOT
  → SessionStart hook（polyglot run-hook.cmd → session-init.sh）：
        · cd $CLAUDE_PLUGIN_ROOT/framework && npm install（幂等）
        · cd $CLAUDE_PLUGIN_ROOT/cli && npm install（幂等）
        · [ ! -f dist/cli.js ] && npx tsc   ← 真 build，幂等
        · 失败则显式 stderr + 非零（不吞错）
  → 用户/agent：/mcp-pipeline <app源码>
        · skill（方法论）加载时声明自身 base dir；指导 agent 执行
        · agent 用 Bash 跑：node "<skill-base-dir>/../../cli/bin/mcp-pipeline.js" <subcmd> ...
          （skill-base-relative，superpowers 同款；不依赖 CLAUDE_PLUGIN_ROOT/PATH）
        · CLI（确定性）干 analyze/scaffold/generate/gates/build
  → 产物：可控 MCP server + 车机交付物 + config 过双闸门
```

---

## 4. 组件

### 4.1 `.claude-plugin/plugin.json` 对齐（ecc 显式模式）
显式声明（对齐 ecc，比纯元数据更"集成"，避免发现歧义）：
```json
{
  "name": "im-mcp-codeagent",
  "displayName": "IM MCP CodeAgent",
  "version": "0.1.0",
  "description": "...",
  "author": {...}, "license": "MIT",
  "homepage": "...", "repository": "...",
  "skills": ["./skills/"],
  "commands": ["./commands/"],
  "hooks": "./hooks/hooks.json",
  "defaultEnabled": true
}
```
去 `mcpServers`（本插件自身不提供常驻 MCP server；它**生成** per-app server）。

### 4.2 hooks 跨平台重构（**核心可靠性修复**）
- 新增 `hooks/run-hook.cmd`（polyglot，照搬 full-featured：Windows `"C:\Program Files\Git\bin\bash.exe" -l "%~dp0%~1"`，Unix sh 段）。
- 新增 `hooks/session-init.sh`：幂等 build——
  ```bash
  #!/bin/bash
  set -euo pipefail
  ROOT="${CLAUDE_PLUGIN_ROOT:?missing CLAUDE_PLUGIN_ROOT}"
  install_if_needed() { [ -d "$1/node_modules" ] || (cd "$1" && npm install --silent); }
  install_if_needed "$ROOT/framework"
  install_if_needed "$ROOT/cli"
  # build dist if missing (idempotent) — NOT --noEmit
  if [ ! -f "$ROOT/cli/dist/cli.js" ]; then
    (cd "$ROOT/cli" && npx tsc) || { echo "[im-mcp] build failed" >&2; exit 1; }
  fi
  ```
- 改 `hooks/hooks.json`：SessionStart 调 `"${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd" session-init.sh`（不再内联单行）。

### 4.3 skills 调用改 skill-base-relative 路径（**核心可靠性修复②**）
机制照搬 superpowers：skill 加载时 harness 注明其 base dir（`Base directory for this skill: <plugin>/skills/<name>`），skill 内以**相对该 base 的路径**引用打包资产。本插件 CLI 在 `<plugin>/cli/bin/mcp-pipeline.js`，任一 skill（在 `<plugin>/skills/<name>/`）相对路径都是 `../../cli/bin/mcp-pipeline.js`。

→ 4 个 skill（mcp-analyze/generate/pipeline/test）里所有裸 `mcp-pipeline <subcmd>` 改为：
`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd>`，其中 `${SKILL_DIR}` 是该 skill 的 base dir（加载时已知；skill 文首注明"本 skill 的 base dir 即加载时显示的路径"）。

优点：**不依赖 `${CLAUDE_PLUGIN_ROOT}`（只在 hook 里由 harness 注入，agent Bash env 未必有）、不依赖 PATH/全局 link、跨平台、双端一致**（Codex skill 同样有 base dir 概念）。`${CLAUDE_PLUGIN_ROOT}` 作为"若 env 可用则可等价替换"的备选注明。

落实：脚本批量替换 4 文件 + grep 校验"无裸 `mcp-pipeline ` 残留"（允许注释/示例里的说明文字）。

### 4.4 `.codex-plugin/plugin.json`（Codex 镜像）
新建，镜像 Claude Code 的 skills/commands/hooks 路径。Codex 字段按 Codex 插件规范（参考 `plugin-creator` skill 的 `.codex-plugin/plugin.json` 形态）。**运行时验证留 §7**（开发环境是 Claude Code）。

### 4.5 `check-manifests` 校验脚本（DRY 防漂移）
`cli` 或 root 加 `scripts/check-manifests.{sh,js}`：对比 `.claude-plugin/plugin.json` 与 `.codex-plugin/plugin.json` 的 skills/commands/hooks 路径一致；不一致非零退出。作为 `npm run check-manifests` + CI/闸门。

### 4.6 本地 marketplace
新建 `.claude-plugin/marketplace.json`（照搬 full-featured-dev 形态）：
```json
{
  "name": "im-mcp-marketplace",
  "description": "IM Cockpit MCP CodeAgent 插件市场（本地/团队）",
  "owner": {"name": "IM Cockpit Team"},
  "plugins": [
    {"name": "im-mcp-codeagent", "description": "...", "version": "0.1.0", "source": "./"}
  ]
}
```
`source: "./"` → 团队 `/plugin marketplace add <repo路径>` 即装，无需公网。

### 4.7 verify 增强 + smoke
- 增强 `cli/src/commands/verify.ts`：对生成的 server 跑① `npm install`+`tsc` 零错；② 启动 server 进程、`tools/list` 非空、`tools/call` 一个 readonly 工具 dry-run；③ rpc 桥本地 dry-call（mock adb executor，验证 rpcCall 编排不崩）。本地确定性，不需真机。
- 真机 smoke 脚本（`scripts/smoke-real-device.sh`）就绪：sendlink→rpcagent→soundstage read/set 对比。**实跑待 P1-T8（同事装车）解阻**；脚本在本子项目内就绪、文档化前置条件。

### 4.8 高度集成：slash commands（可选增强）
新增 `commands/*.md`（Claude Code slash 命令 = markdown 提示）：
- `commands/mcp-pipeline.md` → 指向 mcp-pipeline skill（统一入口）。
- `commands/mcp-verify.md` → 一键跑 verify。
- `commands/mcp-help.md` → 插件能力清单 + CLI 速查。
提升"高度集成"（原生 slash 面）。非阻塞，可后置。

---

## 5. 契约 / schema

- **plugin.json**（§4.1）：Claude Code 插件 manifest 字段。
- **marketplace.json**（§4.6）：`name/owner/metadata?/plugins[]{name,description,version,source,author?}`；`source` 可 `"./"` | `{source:"url",url}` | `{source:"dir",path}`。
- **`.codex-plugin/plugin.json`**：Codex 插件 manifest（`plugin-creator` skill 形态）。
- **hook 契约**：SessionStart 失败必非零 + stderr（不吞错）。

---

## 6. 可靠 / 泛化 / 集成

- **可靠**：装上即用——hook 真 build + 幂等 + 不吞错；CLI 绝对路径调用；verify 本地确定性 smoke。四重保障（build/路径/不吞错/verify）。
- **泛化**：自包含（任意机器）；skills/CLI app 无关（SP-B）；双宿主 manifest。
- **集成**：ecc 式显式 plugin.json + slash commands + SessionStart 自动就绪；`/mcp-pipeline` 一键。
- **构建方式照搬 exemplar**：`${CLAUDE_PLUGIN_ROOT}` 资产引用、polyglot hook、本地 marketplace `source:"./"`——均为 superpowers/ecc/full-featured 实测可用模式，非自创。

---

## 7. 范围边界（SP-D 不含）

- **公网发布**（npm registry / 公开 git marketplace）——留后续；SP-D 只保证本地/团队可装。
- **Codex 运行时真机验证**——manifest 镜像就绪，但开发环境是 Claude Code；Codex 实跑留后续。
- **真机 smoke 实跑**——脚本就绪，阻塞于 P1-T8（同事装车 RpcEngine.ts）。
- **SP-A（选择 UI）/ SP-C（schema 导出）**——独立子项目，不在 SP-D。

---

## 8. 验收标准

- [ ] 全新克隆/拷贝 monorepo → `/plugin marketplace add <path>` + `/plugin install im-mcp-codeagent` 成功。
- [ ] 新会话 SessionStart hook 把 `cli/dist/cli.js` build 出来（幂等：再开会话不重 build）；hook 失败时显式 stderr + 非零（不吞错）。
- [ ] `/mcp-pipeline <fixture>` 在**装后**跑通：scaffold→generate→gates→build，产物可控 server；skills 用 `${CLAUDE_PLUGIN_ROOT}` 绝对路径调 CLI（grep 无裸 `mcp-pipeline ` 残留）。
- [ ] hook 跨平台：Windows（Git Bash）+ Unix 都能 build。
- [ ] `.claude-plugin/plugin.json` 显式声明 skills/commands；`.codex-plugin/plugin.json` 镜像存在且 `npm run check-manifests` 过。
- [ ] `.claude-plugin/marketplace.json` 存在，`source:"./"`，`/plugin marketplace add` 本地路径可装。
- [ ] `verify` 命令：对生成 server 跑 install+tsc+启动+tools/list+dry-call，全绿。
- [ ] 真机 smoke 脚本就绪 + 前置条件文档化（实跑待 P1-T8）。
- [ ] （可选）slash commands `/mcp-pipeline` `/mcp-verify` `/mcp-help` 可用。
- [ ] 回归：SP-B 全量套件仍绿（130+）；生成器零 app 字面量不变。

---

## 9. 实现期风险

1. **CLI 调用路径解析**——已选用 **skill-base-relative**（`../../cli/bin/mcp-pipeline.js`，superpowers 同款），不依赖 `${CLAUDE_PLUGIN_ROOT}`（该变量只在 hook 注入，agent Bash env 未必有）。**实现期 T0 实测确认**：skill 加载时 base dir 是否注入到 agent 可见处、`../../cli/bin/mcp-pipeline.js` 是否解析正确；若 base dir 注入形式与预期不同，调整为 harness 实际提供的形式（如 `${CLAUDE_PLUGIN_ROOT}` 若实测在 env 中）。
2. **Windows Git Bash 路径**（`C:\Program Files\Git\bin\bash.exe`）可能因机器而异——polyglot 需 fallback（`bash` on PATH）。
3. **Codex plugin 规范**字段可能与 Claude Code 不同——`check-manifests` 只校验共有键；Codex 专属字段按其规范填，运行时验证留后续。
4. **`npm install` 首次慢**——幂等后仅首次；可接受。
5. **hook build 失败的降级**——若 build 失败，skill 应给出"手动 `cd cli && npm install && npx tsc`"指引（不静默）。

---

## 10. 与现有资产关系

- 复用 SP-B 全部（framework/cli generators/gates/skills/车机资产）——SP-D **不改**生成器逻辑，只打包+接线+修 hook+补 manifest/marketplace。
- 复用 exemplar 模式（superpowers/ecc/full-featured 的 plugin.json/hooks/marketplace/polyglot）——实测可用，非自创。
- `cli/bin/mcp-pipeline.js`、`hooks/hooks.json` 已存在——SP-D 修内容/补周边，非推倒。
- Phase-1 `mcp-imaudio` 保留为装车基线，不动。
