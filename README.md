<div align="center">

# 🎛️ Code Agent Suite BRIDGE

<img src="assets/bridge.svg" alt="BRIDGE" height="76">

**B**uilding **R**eal-device **I**nterfaces via **D**eterministic **G**ated **E**xecution

`analyze` › `curate` › `scaffold` › `generate` › `gates` › `build`

![version](https://img.shields.io/badge/version-0.1.23-0066cc)
![dual-end](https://img.shields.io/badge/ends-Claude%20Code%20%7C%20Codex-7c3aed)
![platform](https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-339933)

**English** · [简体中文](README.zh-CN.md)

</div>

---

**BRIDGE** (*Building Real-device Interfaces via Deterministic Gated Execution*): agent-driven **skills** carry the methodology, a **deterministic** Node CLI does the heavy lifting, and the host agent drives every step. **No model calls live inside the plugin** — the host agent supplies all judgment, and every generated artifact is byte-for-byte reproducible.

## 🧠 How it works

Given an app's source + manifest, BRIDGE emits an **MCP suite**: agent-facing function schemas, a runnable MCP Server, an RPC wire contract, car-side bridge artifacts, and verification evidence. The upstream agent can call those tools to **actually drive the device** — EQ, soundstage, Beosonic, karaoke, vehicle signals, … — not a throw-stub mock. The function schema surface is the primary artifact for upstream model understanding; the rest of the suite makes those tools executable and auditable.

The pipeline below lays out the stages; the figure after it shows who does what during generation.

**Pipeline** — every step is a deterministic CLI subcommand or an agent skill:

```
validate › analyze › [curate] › scaffold › generate › test › build › register › verify 🟢
  (CLI)     (skill)   (skill)    (CLI)    (skill+gates) (CLI)  (CLI)   (CLI)     (CLI)
```

Progress persists in `.mcp-pipeline/<app>/state.json` for resume — `--from`, `--only`, `--step`, `--batch`.

> The two gates (`validate_config` + `wire_check`) are inline sub-steps of `generate`, retried until both pass before the pipeline advances. `[curate]` is optional.

**The generation process.** Who does what: the host agent supplies judgment (extraction, wire authoring), the CLI is deterministic (scaffold, gates). Each capability is mapped to one tool definition — `name ← id`, `inputSchema ← params`, `annotations ← safety`.

```mermaid
sequenceDiagram
    autonumber
    participant Agent as 🎛️ host codeAgent
    participant Source as 🧱 app source
    participant CLI as 🛠️ deterministic CLI
    participant Tool as 🧩 MCP tool schemas

    Agent->>Source: read proxy + manifest
    Source-->>Agent: methods · capabilities
    Agent->>CLI: scaffold (analysis)
    CLI-->>Agent: server skeleton + adapter
    Agent->>Source: read proxy wire calls
    Agent->>Agent: author per-op wire specs
    Agent->>CLI: validate_config + wire_check
    CLI-->>Agent: pass (or fail → retry)
    loop each capability
        Agent->>Tool: name ← id · inputSchema ← params · annotations ← safety
    end
    Tool-->>Agent: N tool schemas injected
```

**The runtime bridge.** Once built, a tool call flows from the upstream agent through the generated server and a deterministic bridge to the real device — the transport is swappable (`adb` / file / socket), and the wire is constructed purely from `rpc/config.json`, so the bridge carries zero app literals.

```mermaid
sequenceDiagram
    autonumber
    participant Agent as ⚛️ upstream agent
    participant Server as 📡 MCP server
    participant Bridge as 🔌 rpc bridge
    participant Engine as ⚙️ car-side engine

    Agent->>Server: tools/call (name, args)
    Note over Server: safety-gated tools verify a precondition first (fail-closed)
    Server->>Bridge: dispatch(tool, args)
    Bridge->>Bridge: build wire from rpc/config.json
    Bridge->>Engine: command (adb / file / socket)
    Engine->>Engine: drive the real app operation
    Engine-->>Bridge: reply
    Bridge->>Bridge: parse reply → tool return shape
    Bridge-->>Server: typed result
    Server-->>Agent: tool result
```

## 📦 Deliverables

A successful run should produce a reviewable delivery bundle, not just a generated folder:

| Audience | Deliverable | Location | Why it matters |
|---|---|---|---|
| **Upstream agent** | Function schema surface | `tools-schema.json` from `schema_preview`, and `src/tools/schema.ts` inside the generated server | The exact tool names, descriptions, input schemas, safety annotations, and executability flags injected into Claude / Codex. |
| **MCP host** | Runnable MCP Server | Generated server directory, `dist/index.js` after build, and `conf/config.yaml` | The stdio server that hosts the tools. |
| **App / device integrator** | RPC wire contract | `rpc/config.json`, `src/rpc/*`, and `car-side/` | The traceable bridge from each tool call to real app / device operations. |
| **Reviewer** | Verification evidence | `.mcp-pipeline/<app>/state.json`, `.mcp-pipeline/test-results.json`, gate output, build output, verify output | The audit trail showing schema validity, wire coverage, buildability, tool discovery, and tool-call responsiveness. |

Produce the upstream-agent schema directly from analysis plus optional wire status:

```bash
mcp-pipeline schema_preview <analysis.json> [<rpc/config.json>] --output tools-schema.json
```

`rpc/config.json` may mark intentionally unwired tools in `_deferred`; those appear as `executable:false` rather than silently pretending to work.

Done means:

1. `tools-schema.json` exposes every selected capability exactly once.
2. Every tool has a concrete description, concrete input schema, correct enum values, and safety annotations.
3. `validate`, `validate_config`, `wire_check`, `test`, `build`, and `verify` all pass.
4. `verify` proves business-tool calls, not only `health_check`.
5. `car-side/` can be handed to the device-side colleague without reverse-engineering the pipeline internals.

Full contract: [`docs/DELIVERABLE_CONTRACT.md`](docs/DELIVERABLE_CONTRACT.md).

## 🛡️ Why it's reliable

| Guarantee | How it's enforced |
|---|---|
| **Deterministic output** | Generators carry zero app literals — any app, any machine, byte-for-byte reproducible. |
| **Verified before build** | Two fail-closed gates — `validate_config` (schema + coverage + dispatchable) and `wire_check` (proxy wire-format match) — must pass on the host's only judgment product, `rpc/config.json`. |
| **Fail-closed safety** | `p_gear_required` tools are blocked unless Park is verified; degenerate input (empty / unmatched) errors instead of passing vacuously. |
| **Honest selection** | `--selection` with a missing file, unknown ids, or an empty list **errors loudly** rather than silently over- or under-generating. |
| **Real bridge, no network** | A car-side RPC engine (delivered to a colleague) bridges host → device over adb / file / sendlink. |
| **Self-contained** | CLI runs via a skill-base-relative path; `framework/` + `cli/` deps auto-install and build on first session. |

## 📥 Install & run

**Claude Code**

```bash
/plugin marketplace add https://github.com/MatCaviar/im-mcp-codeagent.git
/plugin install im-mcp-codeagent
```

First session start auto-installs `framework/` + `cli/` and builds `cli/dist` (idempotent). Then start a pipeline run:

```
/mcp-pipeline ./path/to/your-app
```

Entry points — `/mcp-pipeline` · `/mcp-verify <dir>` · `/mcp-help`.

**Codex** reads the mirrored `.codex-plugin/plugin.json` (dual-end).

Typical run shape:

```bash
# deterministic checks / generation
mcp-pipeline validate <analysis.json>
mcp-pipeline scaffold <analysis.json> --output <server>

# host-agent judgment product + deterministic gates
mcp-pipeline validate_config <server>/rpc/config.json --analysis <analysis.json>
mcp-pipeline wire_check <server>/rpc/config.json --proxy <path/to/Proxy.ts>

# upstream-agent schema and runtime proof
mcp-pipeline schema_preview <analysis.json> <server>/rpc/config.json --output <server>/tools-schema.json
mcp-pipeline test --dir <server>
mcp-pipeline build --dir <server>
mcp-pipeline verify --dir <server>
```

Normal plugin users usually enter through `/mcp-pipeline`; the lower-level CLI commands are shown so the generated delivery bundle is auditable and reproducible.

## 🧩 Capability selection

Most apps expose far more capabilities than you want to MCP-ify. After install and initial `analyze`, **curate** lets you choose the subset — the user's pick is the first priority.

```bash
# 1. Enumerate candidates deterministically (writes nothing)
mcp-pipeline curate <analysis.json> [--prd <prd.md>]

# 2. /mcp-curate proposes a subset, you choose → writes selection.json
# 3. Scaffold generates only the chosen capabilities
mcp-pipeline scaffold <analysis.json> --output <dir> --selection .mcp-pipeline/<app>/selection.json
```

`selection.json = { "selected": ["<cap.id>", …] }`. Re-pick any time — the generate-layer regenerates, while `conf/config.yaml` and `rpc/config.json` are preserved.

## 🔄 Update (already installed)

When a new version ships, refresh and reload:

```text
/plugin marketplace update im-mcp-marketplace        # 1. refresh the catalog   (arg = marketplace name)
/plugin update im-mcp-codeagent@im-mcp-marketplace   # 2. pull the new version  (arg = plugin@marketplace)
/reload-plugins                                      # 3. activate it + re-run the build hook
```

> `/reload-plugins` (or a full `/exit` + relaunch) is **required** — until then the previous version stays live. The first session after reload re-runs the `SessionStart` build hook, which compiles `cli/dist` for the new version.

Verify the installed version:

```text
/plugin list
```

**Fallback** — if `/plugin update` reports "already latest" but the code didn't change (stale cache, or the version wasn't bumped):

```text
/plugin uninstall im-mcp-codeagent@im-mcp-marketplace
/plugin marketplace update im-mcp-marketplace
/plugin install im-mcp-codeagent@im-mcp-marketplace
/reload-plugins
```

## 📡 Real-device prerequisites

The generated server drives the car over an adb / file bridge. Before a real device responds:

1. **Colleague** builds + installs the car-side `RpcEngine.ts` and registers the `page://<app>/rpcagent` manifest page — both emitted under `car-side/`.
2. **`adb -host`** reachability to the device.
3. **ZebraAlfred** keep-alive (or equivalent) — otherwise the device sleeps and sendlink intermittently returns exit `-1`.

No device handy? Local verification always works: `mcp-pipeline verify --dir <server>` (install + tsc + tool responsiveness + bridge readiness).

## 🧱 Architecture

```
im-mcp-codeagent/
├── .claude-plugin/       Claude Code manifest + marketplace
├── .codex-plugin/        Codex manifest (dual-end mirror)
├── skills/               mcp-analyze · mcp-curate · mcp-generate · mcp-pipeline · mcp-test  (methodology, no model calls)
├── commands/             /mcp-pipeline · /mcp-verify · /mcp-help
├── hooks/                SessionStart → polyglot build (run-hook.cmd → session-init.sh)
├── cli/                  @im/mcp-pipeline-cli — deterministic Node
│   ├── src/generators/   tool-schema · rpc-bridge · car-rpc-engine · …
│   ├── assets/           car-rpc-engine.ts.template (bundled, de-hardcoded)
│   └── bin/mcp-pipeline.js
├── framework/            @im/mcp-server-framework (shared dispatch core: constructDbusCall / …)
├── tools/adb/            bundled adb (self-contained; see LICENSE note)
└── schema/               analysis.schema.json + fixtures
```

The CLI runs via a **skill-base-relative path** (`${SKILL_DIR}/../../cli/bin/mcp-pipeline.js`) — self-contained, no PATH / global-link dependency.

## 🛠️ Develop

This section is for maintainers changing the plugin itself. Normal users running `/mcp-pipeline` do not need these commands.

```bash
cd framework && npm install
cd ../cli     && npm install && npx tsc     # build cli/dist (the real CLI loads dist/ — rebuild after source edits)
cd ../cli     && npx vitest run             # full suite
node scripts/check-manifests.js             # claude / codex manifest drift guard
```


## 🆕 2026-08 新增: E2E 语音闭环 / bridge-analyze / 车端执行器

本仓库在 0.1.8 插件之上新增了落地产物（与插件 CLI 互补，CLI 不变）：

| 新增 | 位置 | 说明 |
|---|---|---|
| **bridge-analyze skill** | `skills/bridge-analyze/` | 面向现 E2E serve 规格的重构版分析 skill：任意 app(源码/PRD/APK/观察) → analysis.json。自带校验器 `validate-analysis.mjs`（对齐 serve 规格；旧插件 validate 面向 scaffold 流程）。取代 mcp-analyze 用于现 E2E 流程，二者并存。 |
| **E2E 端到端测试** | `e2e/` | 语音→车 闭环：mcp-gateway 源码 + `bridge-analysis.json`(唯一真相源) + `bridge-serve-wrapper.mjs`(动态 IP 探测+断线自愈) + `bridge-ui-server.mjs`(App 型能力 ui_launch/ui_dump/ui_tap_text/geo_search) + `analysis-to-registry.mjs`(analysis→车端 registry 生成器)。38 工具面全绿实测。 |
| **车端执行器源码** | `bridge-executor/` | `com.immotors.bridge.executor`：execmd/media/mapnav/carcontrol/intent 五机制分派，手写 binder 契约（事务码声明序、typed-parcelable）。 |
| **工具脚本** | `tools/car_invoke.sh` `tools/probe_carcontrol.sh` + 车控 57 候选(handlers/candidates json) | 车端 invoke 助手 + 车控批量验证脚本 |
| **移交文档** | `handoff/` | 移交说明 + NEXT STEPS |
| **本地 ASR** | `asr/` | faster-whisper 中文识别(端口 8765) |

**E2E 快速开始**：`cd e2e && npm install && QWEN_API_KEY=<key> npm run dashboard -- --config config-cockpit.yaml`（先起 `asr/asr-whisper-server.py`），浏览器 `http://localhost:3000/cockpit` 点 🎤 说话。

**规格对齐**：`schema/analysis.schema.json` 已扩展支持 mechanism 等新字段（sdkCalls/app.domain/entryFile 降为可选）——新旧 analysis 均可通过旧 `validate`；新流程推荐用 bridge-analyze 自带校验器。

**0.1.23 清理说明**：旧 scaffold 流程已整体移除（`scaffold/generate/curate/build/register/verify/test/schema_preview/wire_check/validate_config/validate_aidl` 命令、`generators/`、`framework/` 包、`mcp-curate/mcp-generate/mcp-pipeline/mcp-test` skills、`commands/`、`docs/`）——它们面向"生成完整 MCP server 工程"的旧流水线，现 E2E 不再使用。当前有效链路：**bridge-analyze（分析+校验）→ analysis.json → serve（MCP 投影）/ invoke（车端执行）**，CLI 仅保留 `validate`/`serve`/`invoke` 三个子命令，formatResponse 已内联，依赖收敛为 `@modelcontextprotocol/sdk`/`zod`/`ajv`。测试保留并改写为对齐新规格（29 用例全绿）。README 主体为 0.1.8 原文，其中 pipeline 描述属旧流程，以本节为准。

**工具规格流（唯一真相源）**：`e2e/bridge-analysis.json`(serve 字段+机制字段) → `node e2e/analysis-to-registry.mjs` 生成车端 registry → 校验 `node skills/bridge-analyze/validate-analysis.mjs e2e/bridge-analysis.json`。

凭据(DashScope key / 车签名 keystore)不随仓库分发。逆向素材(dex dump, 1.7GB)不入库, 位置见 `reverse/README.md`。

## 📜 License

MIT — see [LICENSE](LICENSE). `tools/adb/` bundles Google's adb under its own terms.

<div align="center">
<sub>Code Agent Suite BRIDGE — built by Tongji University &amp; IM · controllable code generation for the cockpit</sub>
</div>
