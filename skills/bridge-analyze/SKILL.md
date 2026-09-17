---
name: bridge-analyze
description: '分析应用源码、PRD、APK 或运行行为，产出上游智能体可调用的 BRIDGE 能力契约、function schema 与项目适配产物。用于将用户指定的应用接入 MCP，支持本地应用、Android 设备及仿真环境。'
---

# bridge-analyze

从用户指定的输入中识别可调用能力，生成 `analysis.json`，并由套件确定性导出 `function-schema.json`。先解析本 SKILL.md 的绝对目录，向上两级得到 `<套件根>`；所有套件命令使用该路径，不依赖用户的当前目录。

## 项目边界

产物放在用户指定目录或 `<项目>/.mcp-pipeline/<app>/`。应用专属接口、包名、源码、协议和测试素材保存在项目产物内，保持插件安装目录可复用。需要新增执行适配时，在项目内实现 HTTP adapter，或通过 `BRIDGE_ADAPTER_DIR` 提供 Android 接口源码。

读取实际源码、manifest、接口文档和服务注册点确定操作名、参数值域与协议。PRD 描述的能力若缺少可执行入口，记录为待实现项；不要编造 wire。APK 解析按用户范围进行，耗时阶段持续报告进度。

## 契约设计

先阅读 [工具契约](../../docs/tool-contract.md)。选择与目标接口匹配的模式：

- `individual`：每项能力一个函数。
- `channel`：一个公开工具，通过 action 区分能力；业务字段、extras 与返回码依据项目接口定义。
- 上游语义名称与底层字段不同，使用 `publicAction`、`dispatch.operation` 和 `dispatch.parameterMap` 映射。
- 上下文在 `toolContract.context` 定义。宿主注入值用 `contextBindings` 引用环境变量，禁止把凭据写入产物。
- params 必须展开对象和数组的 `properties/items`；保留 enum、范围、单位、默认值与必填语义。description 说明操作用途、参数含义与依赖。
- 每个能力注明 `sourceRef`、`scope` 和 `status`。core 是本项目能力；shared/platform 通过 `deliveryScopes` 显式加入。媒体 builtin 同样按需选择。
- `probe` 表示待运行验证，`verified` 表示已通过目标环境调用及相关结果检查，`broken` 表示已知不可用。记录源码核对与实机验证的区别。
- 前置条件通过可信宿主或设备状态供给，避免让模型自行声明满足。

HTTP 与 Android 示例分别见 [channel-analysis](../../examples/channel-analysis.json) 和 [android-analysis](../../examples/android-analysis.json)。选择 Android 时阅读 [执行器说明](../../bridge-executor/README.md)，确认签名、权限、事务码及部署用户符合目标环境。

## 生成与验证

```bash
node "<套件根>/skills/bridge-analyze/validate-analysis.mjs" "<产物>/analysis.json"
node "<套件根>/cli/bin/mcp-pipeline.js" schema --analysis "<产物>/analysis.json" --format bridge --out "<产物>/function-schema.json"
node "<套件根>/e2e/analysis-to-registry.mjs" "<产物>/analysis.json" "<产物>/registry.json"
```

需要 OpenAI/Anthropic 原生 envelope 时导出 `--format all`。MCP `tools/list` 与文件共用同一生成器。channel 模式工具数量为 1，动作数量由所选能力决定；individual 模式数量为所选能力加显式 builtins。

运行 [schema 注入测试](../../e2e/schema-injection-smoke.mjs)核对文件、stdio tools/list 与 provider 转换；首次执行先按 E2E README 安装依赖并构建。在可用且已授权的环境中使用 `call --analysis ... --op ... --args ...` 验证业务操作，包括非法参数与失败返回。Android 另传 `--device` 和实际 `--user`。底层 `invoke` 用于排查传输，绕过公开 schema 的调用不能代替完整测试。

缺少设备、接口权限或模型凭据时，先完成本地契约验证，清楚报告尚待运行的部分。Intent/media 的 dispatched 结果只说明操作已提交，必要时继续读取状态或观察界面。

## 可视化与端到端

默认提供与本项目对应的可视化。复制 `<套件根>/viz/` 到产物目录；使用绝对路径生成数据并启动：

```bash
node "<产物>/viz/gen.mjs" "<产物>/analysis.json" "<产物>/registry.json"
node "<产物>/viz/run.mjs" --suite-root "<套件根>" --project-root "<项目>" --analysis "<产物>/analysis.json" --src "<项目>" --open
```

端口默认 8650；冲突时选择其他端口。检查 `/api/health` 中项目身份与本次输入一致。无法打开浏览器时提供可访问地址。通过 `/api/session/start` 与 `/api/session/event` 上报真实进度：n1 输入、n2 能力、n3 校验、n4a schema、n4b registry、n5 部署、n6 运行。JSON 使用 UTF-8；观察服务失败不阻断产物生成。

页面 E2E 入口可拉起模型网关。按实际能力构造测试：典型操作、枚举边界、多意图、近义指令、范围外请求；每批至多 12 条。channel 测试除了工具名，还检查 action 和业务参数。工具选择与执行结果分开判断；设备失败不能通过改写 description 消除。只重测受修改影响的用例。

补充 PRD 对照与交付说明时，使用当前项目实际材料。用户调整 scope 后，同步重新生成 schema、registry 与可视化。

## 交付

说明产物位置、选中能力和工具数量、调用方式、测试结果与待部署项。对真实设备执行仅报告观察到的结果，仿真结果明确标注。

可选反馈保存在项目内；如需使用 `feedback.mjs submit` 向远端创建 Issue（GitHub 优先，失败自动兜底内网 GitLab），先取得用户对该次外部提交的授权。
