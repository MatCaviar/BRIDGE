# 代码智能体套件 BRIDGE

**B**uilding **R**eal-device **I**nterfaces via **D**eterministic **G**ated **E**xecution

![version](https://img.shields.io/badge/version-0.2.0-0066cc)

BRIDGE 将应用源码、接口文档、APK 和运行观察转化为上游智能体可调用的工具，适用于本地应用、Android 设备、车机与仿真台架。应用专属契约与适配代码保存在使用者自己的项目目录中。

## 安装

在 Codex 插件设置中添加本仓库并安装 **BRIDGE**（`im-mcp-codeagent`）。插件标识保持兼容，便于已有用户升级。

Claude Code：

```text
/plugin marketplace add https://github.com/MatCaviar/BRIDGE.git
/plugin install im-mcp-codeagent@im-mcp-marketplace
```

安装后，让 `bridge-analyze` 分析你的项目。产物保存到项目目录，与插件安装目录分开。CLI 首次使用自动安装依赖并构建，需要 Node.js 20.19+。

## 产物与调用方式

- `analysis.json`：能力定义、参数约束、公开工具契约与执行配置。
- `function-schema.json`：提供给上游智能体的函数定义，包含完整的嵌套输入与输出规格。
- MCP Server：通过 `tools/list` 注入相同规格，通过 `tools/call` 校验并执行。
- 按需生成 `registry.json` 和项目自己的 Android 适配代码。

支持“每项能力一个工具”和“单个 channel 工具”两种方式。统一入口接受 `arguments.action`、业务参数及 `arguments.extras`，返回 `code / message / data / extras`；默认仅 `code: 0` 表示业务成功。字段名称、参数映射和上下文来源均可配置，详见[工具契约](docs/tool-contract.md)与[示例](examples/)。

## 本地体验

在仓库根目录启动中性 HTTP 仿真服务：

```bash
node e2e/demo-device.mjs
```

另开终端：

```bash
node cli/bin/mcp-pipeline.js schema --analysis examples/channel-analysis.json --format all --out function-schema.json
node cli/bin/mcp-pipeline.js call --analysis examples/channel-analysis.json --op set_level --args '{"level":35}'
node viz/run.mjs --open
```

内置示例提供三个仿真控制项，不连接真实设备。可视化包含实时执行视图及可选的智能体端到端测试入口；模型测试使用你配置的服务与凭据。

## 接入自己的应用

```bash
node skills/bridge-analyze/validate-analysis.mjs /path/to/analysis.json
node cli/bin/mcp-pipeline.js schema --analysis /path/to/analysis.json --out /path/to/function-schema.json --format bridge
node cli/bin/mcp-pipeline.js serve --analysis /path/to/analysis.json
```

HTTP 适配端地址写在 analysis 中。Android 模式增加 `--device <serial>`，多用户设备按需增加 `--user <id>`；默认用户为 `0`。按[执行器说明](bridge-executor/README.md)构建并部署项目自己的接口与 registry。媒体工具及其他平台能力均按配置选择。

CLI 命令为 `schema`、`serve`、`call` 与底层 `invoke`。analysis 校验统一使用上面的独立脚本。

## 开发

```bash
npm --prefix cli ci
npm --prefix cli run build
npm --prefix cli test
npm --prefix e2e ci
npm --prefix e2e run build
npm --prefix e2e test
node e2e/schema-injection-smoke.mjs --analysis examples/channel-analysis.json
node scripts/check-manifests.js
```

CLI、校验器、registry 生成器与可视化共用 analysis 契约。完整流程见[分析 skill](skills/bridge-analyze/SKILL.md)，测试方式见[E2E 说明](e2e/README.md)。

## 许可证

[MIT](LICENSE)。内置 Android 平台工具遵循自身许可证。
