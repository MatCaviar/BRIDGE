<div align="center">

# 🎛️ Code Agent Suite BRIDGE

<img src="assets/bridge.svg" alt="BRIDGE" height="76">

**B**uilding **R**eal-device **I**nterfaces via **D**eterministic **G**ated **E**xecution

![version](https://img.shields.io/badge/version-0.2.0-0066cc)
![dual-end](https://img.shields.io/badge/ends-Claude%20Code%20%7C%20Codex-7c3aed)
![platform](https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-339933)

**English** · [简体中文](README.zh-CN.md)

</div>

BRIDGE 把车机等本地 app 变成上游智能体可以真实调用的工具。输入一个 app（源码工程、多模块模板、APK、PRD 皆可），产出一套完整的 MCP 交付物：智能体能读懂的函数 schema、可直接运行的 MCP Server、车端分派表，以及每项能力真实有效的验证证据。

方法论放在 agent skill 里，重活全部由确定性的 Node CLI 完成，产物逐字节可复现。能力分析与 schema 生成的判断由宿主 codeagent 给出，确定性由 CLI 保证；端到端测试按需接入上游模型。

## 🧠 How it works

四步主线，每一步都可复查：

```
输入任意 app(源码 / 模板 / APK / PRD / 行为观察)
  → bridge-analyze 产出 analysis.json(唯一真相源)
  → validate-analysis 确定性校验
  → serve 投影为 MCP 工具(上游智能体直接挂载)
  → call 校验调用，按项目配置执行（HTTP adapter / Android invoke）
```

`analysis.json` 一份产物两处消费：serve 把 `id / description / params / scope` 投影成 MCP 工具面；车端执行器消费 `mechanism` 等机制字段（经 `registry.json` 分派）。

支持每项能力一个函数，或通过 `action` 区分操作的统一 channel；上下文放在 `extras`，返回 `code / message / data / extras`，默认 `code: 0` 为业务成功。完整定义见[工具契约](docs/tool-contract.md)。应用专属协议与适配代码保存在使用者自己的项目目录中。

运行期一次工具调用的完整链路：

```mermaid
sequenceDiagram
    autonumber
    participant Agent as ⚛️ 上游智能体
    participant Server as 📡 MCP Server(serve)
    participant Executor as ⚙️ 项目适配器 / 车端执行器
    participant App as 🧱 目标 app / 车机

    Agent->>Server: tools/call (name, args)
    Server->>Server: 校验参数与前置条件，映射 action / extras
    Server->>Executor: HTTP 调用 / invoke(op, args) 经 adb 信箱
    Executor->>App: 按项目协议分派（HTTP / AIDL / 单入口命令 / 媒体 / Intent）
    App-->>Executor: 真实执行结果
    Executor-->>Server: 执行结果与业务错误码
    Server-->>Agent: 工具结果(失败如实上报)
```

## 📦 Deliverables

一次成功运行产出可评审的交付包，而不是一个生成目录：

| 交付物 | 内容 | 给谁用 |
|---|---|---|
| `analysis.json` | 唯一真相源：全部能力（id、参数、机制字段、scope 归属、status、逐项交付说明） | 评审与再生成 |
| `function-schema.json` | 上游智能体函数定义（名称、描述、参数 schema、枚举） | 注入 Claude / Codex 等上游 |
| `registry.json`（Android 接入时） | 车端分派表（bind/call、wire 值、机制字段投影） | 车端执行器 |
| `prd-coverage.json`（有 PRD 时） | PRD 条目与能力的对照（已对应 / 缺口 / 超出） | 验收与评审 |
| 验证证据 | validate 结果、契约核对报告、真实 LLM 工具选择测试 | 审计 |

能力归属分级是交付的核心约定：`core`（本 app 自身设计目的的能力，交付主体）、`platform`（借道可达但归属平台或其他 app，默认不进本 app 交付）、`shared`（显式共享）。单一 app 的交付默认只含 core，避免跨团队产出重复。

## 🛡️ Why it's reliable

| 保证 | 如何做到 |
|---|---|
| **确定性产出** | CLI 零 app 字面量，任意机器逐字节可复现 |
| **先验证再交付** | validate-analysis 确定性校验 + 逐字契约核对 + 真实 LLM 工具选择测试 |
| **状态诚实** | verified / probe / broken 各带证据；broken 默认不进 serve；设备不可达如实报错，绝不谎称成功 |
| **归属清晰** | core / platform 分级，单 app 交付纯净，跨 run 不重复 |
| **自包含** | CLI 经 skill 相对路径运行，首会话自动装依赖并构建；问题反馈通道内置（按需、高信噪比） |

## 📥 Install & run

**First run**，with Node.js installed, after `git clone`, just:

```bash
node viz/run.mjs --open
```

The viz page opens in your default browser (bundled sample data); click "▶ 端到端测试" and deps → build → config → gateway are all auto-bootstrapped (the page asks for the LLM key if missing). For the bundled HTTP simulation, start `node e2e/demo-device.mjs` in another terminal before invoking tools. To analyze your own app, use the plugin flow below，bridge-analyze switches the visualization to your project automatically.

**Claude Code**

```bash
/plugin marketplace add https://github.com/MatCaviar/BRIDGE.git
/plugin install im-mcp-codeagent
```

First session start auto-installs `cli/` deps and builds `cli/dist` (idempotent).

Entry points，the `bridge-analyze` skill (analysis + validation) and the CLI (`schema` · `serve` · `call` · `invoke`). For the voice E2E loop (gateway + cockpit), see the 2026-08 section below.

**Codex** reads the mirrored `.codex-plugin/plugin.json` (dual-end).

Typical run shape:

```bash
# 1. 分析(由宿主 codeagent 执行 bridge-analyze skill)产出 analysis.json, 然后:
node skills/bridge-analyze/validate-analysis.mjs <analysis.json>

# 2. 导出函数 schema，投影为 MCP Server(上游智能体挂载)
node cli/bin/mcp-pipeline.js schema --analysis <analysis.json> --out <function-schema.json>
node cli/bin/mcp-pipeline.js serve --analysis <analysis.json> --device <车IP>:5555

# 3. 通过同一契约逐项调用复核（HTTP 模式省略 --device）
node cli/bin/mcp-pipeline.js call --analysis <analysis.json> --op <tool_id> --device <车IP>:5555 [--args '<json>']
```

可视化与端到端测试随套件自带：`node viz/run.mjs` 单端口提供管线大屏与 cockpit（默认自动打开浏览器）。

## 🧩 Capability selection

Most apps expose far more capabilities than you want to MCP-ify. Selection happens **in the analysis itself** (no separate curate step):

- `capabilities[].status`，`verified` / `probe` / `broken`; serve skips `broken` by default (`--include-broken` exposes them for inspection; execution remains blocked)
- Drop or keep a capability by editing `analysis.json` and re-running `validate-analysis.mjs`，the file is the single source of truth, consumed by both `serve` (tool surface) and the car-side registry
- Callback-registration style methods (non-scalar binder params) are recorded as excluded with reasons, not silently dropped

## 🔄 Update (already installed)

When a new version ships, refresh and reload:

```text
/plugin marketplace update im-mcp-marketplace        # 1. refresh the catalog   (arg = marketplace name)
/plugin update im-mcp-codeagent@im-mcp-marketplace   # 2. pull the new version  (arg = plugin@marketplace)
/reload-plugins                                      # 3. activate it + re-run the build hook
```

> `/reload-plugins` (or a full `/exit` + relaunch) is **required**，until then the previous version stays live. The first session after reload re-runs the `SessionStart` build hook, which compiles `cli/dist` for the new version.

Verify the installed version:

```text
/plugin list
```

**Fallback**，if `/plugin update` reports "already latest" but the code didn't change (stale cache, or the version wasn't bumped):

```text
/plugin uninstall im-mcp-codeagent@im-mcp-marketplace
/plugin marketplace update im-mcp-marketplace
/plugin install im-mcp-codeagent@im-mcp-marketplace
/reload-plugins
```

## 📡 Real-device prerequisites

The generated server drives the car over an adb / file bridge. Before a real device responds:

1. Build and install the [generic Android executor](bridge-executor/README.md), then deploy the project's own `registry.json` and interface sources as needed.
2. **`adb -host`** reachability to the device. The repo bundles a Windows adb (`tools/adb/adb.exe`); **macOS/Linux users need adb on PATH** (e.g. `brew install android-platform-tools`) or set `BRIDGE_ADB` to its path.
3. Keep the device awake and configure the target's required permissions and Android user (`--user`, default `0`). The Android mailbox transport requires privileged shell access; HTTP adapters use their own project integration.

No device handy? Use the [local simulation and schema injection tests](e2e/README.md). HTTP integrations configure their endpoint in `analysis.json` and do not require an Android executor.

## 🧱 Architecture

```
im-mcp-codeagent/
├── .claude-plugin/       Claude Code manifest + marketplace
├── .codex-plugin/        Codex manifest (dual-end mirror)
├── skills/               bridge-analyze (analyze → analysis.json, with validator)
├── hooks/                SessionStart → build cli (session-init.mjs)
├── cli/                  @im/mcp-pipeline-cli，deterministic Node
│   ├── src/commands/     schema · serve · call · invoke
│   └── bin/mcp-pipeline.js
├── contract/             shared analysis validation
├── bridge-executor/      generic Android executor
├── e2e/                  gateway + simulation + integration tests

└── tools/adb/            bundled adb (self-contained; see LICENSE note)
```

The CLI runs via a **skill-base-relative path** (`${SKILL_DIR}/../../cli/bin/mcp-pipeline.js`)，self-contained, no PATH / global-link dependency.

## 🛠️ Develop

This section is for maintainers changing the plugin itself. Normal users using `bridge-analyze` do not need these commands.

```bash
npm --prefix cli ci
npm --prefix cli run build                 # build cli/dist (rebuild after source edits)
npm --prefix cli test                      # CLI tests
npm --prefix e2e ci
npm --prefix e2e test                      # gateway integration tests
node scripts/check-manifests.js             # claude / codex manifest drift guard
```


## 🆕 2026-08 新增: E2E 语音闭环 / bridge-analyze / 车端执行器

本仓库在 0.1.8 插件之上新增了以下产物，并随套件持续更新：

| 新增 | 位置 | 说明 |
|---|---|---|
| **bridge-analyze skill** | `skills/bridge-analyze/` | 分析 skill：任意 app(源码/PRD/APK/观察) → analysis.json（MCP serve 直接投影）。自带校验器 `validate-analysis.mjs`。 |
| **E2E 端到端测试** | `e2e/` | 语音→车 闭环：mcp-gateway 源码 + `bridge-analysis.json`(唯一真相源) + `bridge-serve-wrapper.mjs`(动态 IP 探测+断线自愈) + `bridge-ui-server.mjs`(App 型能力 ui_launch/ui_dump/ui_tap_text/geo_search) + `analysis-to-registry.mjs`(analysis→车端 registry 生成器)。工具面由本次 analysis 的选中能力与调用模式决定。 |
| **车端执行器源码** | `bridge-executor/` | `org.bridge.executor`：aidl/execmd/media/intent 通用机制，目标接口与 Binder 参数由项目配置。 |
| **工具脚本** | `tools/car_invoke.sh` | Android invoke 命令兼容入口 |
| **接入文档与样例** | `docs/tool-contract.md`、`examples/` | 公共契约、HTTP channel 与 Android 接入样例 |

**E2E quick start** (two ways): **one-click**，open the viz page `http://localhost:8650/pipeline.html` and click "端到端测试"; gateway/deps/config are auto-bootstrapped (the page asks for the LLM key if missing, and points serve at the current analysis in project mode). **manual**，`cd e2e && npm install && QWEN_API_KEY=<key> npm run dashboard -- --config config-cockpit.yaml` (optionally configure your own ASR service for voice input), then open `http://localhost:3000/cockpit` and talk to the 🎤.

**单一校验入口**：analysis 规格由 `skills/bridge-analyze/validate-analysis.mjs` 校验；CLI 负责 `schema` / `serve` / `call` / `invoke`，避免旧 schema 与 E2E 规格漂移。

**工具规格流（唯一真相源）**：项目的 `analysis.json`(serve 字段+机制字段) → `node e2e/analysis-to-registry.mjs <analysis.json> <registry.json>` 按需生成车端 registry → 校验 `node skills/bridge-analyze/validate-analysis.mjs e2e/bridge-analysis.json`。

凭据(DashScope key / 车签名 keystore)不随仓库分发。应用源码、逆向素材与专属适配保存在使用者自己的项目中。

## 📜 License

MIT，see [LICENSE](LICENSE). `tools/adb/` bundles Google's adb under its own terms.

<div align="center">
<sub>Code Agent Suite BRIDGE，built by Tongji University &amp; IM · controllable code generation for the cockpit</sub>
</div>
