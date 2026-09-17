---
name: bridge-analyze
description: '分析应用源码、PRD、APK 或运行行为，产出上游智能体可调用的 BRIDGE 能力契约、function schema 与项目适配产物。用于将用户指定的应用接入 MCP，支持本地应用、Android 设备及仿真环境。'
---

# bridge-analyze

从用户指定的输入中识别可调用能力，生成 `analysis.json`，并由套件确定性导出 `function-schema.json`。先解析本 SKILL.md 的绝对目录，向上两级得到 `<套件根>`；所有套件命令使用该路径，不依赖用户的当前目录。

## 项目边界

产物放在用户指定目录或 `<项目>/.mcp-pipeline/<app>/`。应用专属接口、包名、源码、协议和测试素材保存在项目产物内，保持插件安装目录可复用。需要新增执行适配时，在项目内实现 HTTP adapter，或通过 `BRIDGE_ADAPTER_DIR` 提供 Android 接口源码。

读取实际源码、manifest、接口文档和服务注册点确定操作名、参数值域与协议。PRD 描述的能力若缺少可执行入口，记录为待实现项；不要编造 wire。APK 解析按用户范围进行，耗时阶段持续报告进度。

## PRD 输入

只有 PRD（PDF/xlsx/CSV/文档）也能产出 MCP 协议表：

1. **抽取**：xlsx 逐 sheet 转成表格逐行核对；PDF 先抽取文本与表格再判断成色——拿到的是明细（功能名/参数/类型/必填/取值范围/话术示例/错误码）还是仅范围清单。索引型 PRD 只有功能名和引用文件名，不要据此编造参数。
2. **映射**：明细逐条映射 capability（参数、enum、min/max、required，话术示例进 `utterances`）；错误码表进 `toolContract.response.errorCodes`；契约头（版本/超时/client 包名）进 `toolContract.version/timeoutMs/clientPackage`；PRD 出处写 `sourceRef`。索引型 PRD 登记能力骨架（`status:"broken"`、空 params、`description` 注明依据），同时产出待补明细清单请用户补齐引用文件。
3. **交付**：PRD-only 没有执行链，不写 transport/mechanism，能力保持 `broken`；校验通过后用 `schema --format mcp --include-broken` 导出协议表。交付口径 = 协议表（全部能力标注待验证）+ 待实现/待补明细清单；registry 与部署等执行链接入后再补。

E2E 用例可直接取各能力 `utterances` 作首批话术。

## 契约设计

先阅读 [工具契约](../../docs/tool-contract.md)。选择与目标接口匹配的模式：

- `individual`：每项能力一个函数。
- `channel`：一个公开工具，通过 action 区分能力；业务字段、extras 与返回码依据项目接口定义。
- 通道元数据（契约版本、超时声明、client 包名）与错误码表用 `toolContract.version`/`timeoutMs`/`clientPackage` 与 `toolContract.response.errorCodes` 声明，导出时自动并入工具描述，上游 Agent 在协议表内即可看到失败语义。
- 上游语义名称与底层字段不同，使用 `publicAction`、`dispatch.operation` 和 `dispatch.parameterMap` 映射。
- 上下文在 `toolContract.context` 定义。宿主注入值用 `contextBindings` 引用环境变量，禁止把凭据写入产物。
- params 必须展开对象和数组的 `properties/items`；保留 enum、范围、单位、默认值与必填语义。description 说明操作用途、参数含义与依赖。
- 每个能力注明 `sourceRef`、`scope` 和 `status`。core 是本项目能力；shared/platform 通过 `deliveryScopes` 显式加入。媒体 builtin 同样按需选择。
- `probe` 表示待运行验证，`verified` 表示已通过目标环境调用及相关结果检查，`broken` 表示已知不可用。记录源码核对与实机验证的区别。
- 前置条件通过可信宿主或设备状态供给，避免让模型自行声明满足。

HTTP 与 Android 示例分别见 [channel-analysis](../../examples/channel-analysis.json) 和 [android-analysis](../../examples/android-analysis.json)。选择 Android 时阅读 [执行器说明](../../bridge-executor/README.md)，确认签名、权限、事务码及部署用户符合目标环境。

## 执行链接

把 MCP 调用链接到真实应用时，先逆向目标接口再选路径，不要猜线格式：

1. **逆向契约**：应用接口常在 AAR/jar 里（如 `libs/*.aar`）。解包取 `classes.jar`，用 `javap -p`（或解析 class 常量池）提取接口方法签名与 descriptor；AIDL 单方法接口事务码 = `FIRST_CALL_TRANSACTION + 方法声明序`。
2. **线格式判断**：与执行器四种机制（`aidl` 单 JSON 串方法 / `execmd` (String JSON, Binder) 双参与单 string 回调 / `intent` / `media`）逐 parcel 段对照。匹配 → 生成 registry（必要时 `BRIDGE_ADAPTER_DIR` 提供接口源码）；不匹配（回调式多参、多字段回调、自定义 parcelable）→ 项目自持 HTTP 适配器，`transport` 指向它，不部署执行器 APK。
3. **适配器形态**：只做协议转换——校验工具名后把 `arguments` 原样透传给应用入口，应用应答组装 `{code,message,data,extras}` 信封；对业务 action 透明，应用新增 action 无需改适配器。仅监听 `127.0.0.1`，宿主经 `adb forward` 访问。参考结构见套件外项目（逆向 AIDL + HTTP 桥 + 离线构建脚本）。
4. **验证**：`call --analysis ... --name ... --args ...` 走与 MCP 完全相同的校验与响应路径，附非法参数与越界值用例；无设备时交付构建与部署手册，能力保持 `probe`/`broken`，并注明执行链出处（`sourceRef`）。

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
