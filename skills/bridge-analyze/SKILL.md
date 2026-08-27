---
name: bridge-analyze
description: '任意应用(源码/PRD/APK/行为观察) → 上游 Agent 可调能力全链路交付: analysis.json(唯一真相源) + function-schema.json(上游注入) + 可选 registry/app wire + 全程可视化 + 收尾自动端到端测试。host codeagent 自主分析一个应用并自证有效。当用户给一个 app(目录/文档/APK) 并要求产出能力清单/工具 schema/agent 可调接口时使用。'
---

> 🌐 默认用中文与用户交互和输出；代码/命令/标识符/文件名保持英文。

# bridge-analyze — 应用 → 上游 Agent 能力调用 Schema

本 skill 由 **host codeagent 自主执行**：输入任意应用的信息，产出一套可评审的交付 bundle —— `analysis.json`（唯一真相源）、`function-schema.json`（上游 Agent 函数定义）、可选 `registry.json`（车端执行器）/ app 侧 wire 配置，全程可视化跟随，并以自动端到端测试收尾（发现的问题自行优化）。**你(执行 agent)拥有完全自主性**——按下方契约产出，用标准验证链自证有效，不要等用户补充上下文。本文档是自包含的：所有判断标准、输出规格、验证手段都在这里。

## 输入 → 输出契约

**输入**（用户给什么用什么，可组合）：
- 应用源码目录（Android/Kotlin+AIDL、TypeScript、其他语言）
- PRD / 接口文档 / manifest / AIDL 文件
- APK / 安装包（可逆向：dex、manifest、resources）
- 运行环境（adb 设备、日志、行为观察）

**输出**（产物目录建议 `<输入目录>/.mcp-pipeline/<app>/`，与套件管线状态目录一致）：
- `analysis.json` — 唯一真相源（**必须**）
- `function-schema.json` — 上游 Agent 函数定义，由 CLI 从 analysis 确定性导出（**必须**）
- `registry.json` — 车端执行器 registry，mechanism 字段投影（可选）
- **app 侧 wire 配置**（如 `rpc/config.json`）— 目标 app 自带配置驱动执行端（如通用 RpcEngine 单入口页）时，按其配置格式把全部能力落成可执行 wire，随 analysis 同步演进（可选，适用即做）
- 全程可视化跟随 + 收尾自动端到端测试 — 流程的组成部分，不是可选装饰（见对应章节）
- Agent schema 投影：`capabilities[].id/description/params/status` → `function-schema.json` 的 `name/arguments/options/description`；同一语义也由 MCP `tools/list` 以标准 JSON Schema 注入上游 Agent
- 车端执行：`capabilities[].mechanism` 等机制字段 → registry（一份产物双用；serve 忽略多余字段）
- 先把本 `SKILL.md` 所在目录解析为绝对路径 `<skill目录>`，再把其 `../..` 解析为 `<套件根>`（仓库根：`cli/e2e/...`）。所有套件命令都使用这两个绝对路径，不依赖用户当前工作目录。CLI：`node "<套件根>/cli/bin/mcp-pipeline.js" <subcmd>`（`schema`/`serve`/`invoke`）；analysis 校验只使用 `<skill目录>/validate-analysis.mjs`。

## 输出规格

```jsonc
{
  "app": {
    "name": "app_x",              // serve: server 名 bridge-<name>
    "framework": "android-kotlin",// 输入形态: android-kotlin | apk-reverse | prd-only | ts | ...
    "deviceSources": ["vin"],     // 执行器注入的设备值(agent 不传) — 有则列, 无则省略
    "nativeCallTool": false       // app 是否已实现平台标准 callTool 单入口
  },
  "capabilities": [
    {
      "id": "set_mode",           // snake_case 动词短语 = MCP 工具名
      "domain": "app_x", "object": "mode", "action": "set",
      "safetyLevel": "readonly",  // readonly(无副作用读) | normal(状态改变) | broken(已知不可用)
      "status": "verified",       // verified(源码溯源或实测过) | probe(待实测) | broken(已知不可用, serve 跳过)
      "sourceRef": "path/File.kt:methodName",   // 可溯源: 文件:方法(逆向则注明 "逆向 <date>:<依据>")
      "description": "做什么 + 用户说X时用 + 参数语义/范围 + 前置条件",  // 见"description 规范"
      "params": [
        { "name": "mode", "type": "int", "optional": false,
          "enum": ["0","1","2"],                 // 必须是 wire 真实值, 不是展示名
          "description": "模式编号 0=X 1=Y 2=Z" }
      ],
      // ── 机制字段(车端执行消费; serve 忽略) ──
      "mechanism": "execmd",       // 见"机制选择"
      "methodName": "setMode",     // execmd: 命令名
      "pattern": "dataclass",      // execmd: none|scalar|dataclass|envelope
      "dataClass": "ModeParam",    // dataclass: 反序列化类型
      "devicePaths": ["body.vin"], // envelope: 设备值注入点(须在 app.deviceSources)
      "servicePackage": "com.x.app", "serviceClass": "com.x.app.Service", "bindAction": "com.x.app.ACTION_BIND",
      "ccDomain": "002", "ccFunction": "func_id",  // carcontrol 专用
      "uiSync": { "argKey": "mode", "map": { "1": "运动模式" } }  // 可选: e2e cockpit 在该工具成功后自动点击对应 UI 文案做状态同步(map=参数值→界面文本, 按目标 app 实际文案填写; 无此需求省略)
    }
  ]
}
```

**机制选择**（从 app 对外形态判断；拿不准 → 选最可能 + status=probe）。注意**源码形态与实机部署版本可能不同**（如源码是多方法 AIDL、实机是 executeCommand 单入口）——以源码判断机制, 但涉及实机行为的 status 谨慎标 verified; 有实机时用 invoke 复核后升级。执行通道是**通用底座**：aidl(多方法AIDL反射)/execmd(单入口)/media/mapnav/carcontrol/intent + UI 驱动(ui_* 兜底, 任何 app 可操作)。**新形态的执行端适配由你(执行 codeagent)自行完成**（改执行器/写适配器），套件不自动生成执行代码——分析产物(schema)是唯一的自动交付物：

| mechanism | 适用形态 | 关键字段 |
|---|---|---|
| `aidl` | AIDL 多方法反射(每个能力一个方法, 参数为 JSON 字符串) | interfaceClass(接口全类名, 须编译进执行器 APK) / methodName/pattern/form |
| `execmd` | AIDL 单入口 executeCommand 式(命令名+参数JSON) | methodName/pattern/dataClass/devicePaths |
| `media` | 媒体会话控制(切歌/播放/暂停, 任意媒体 app) | 内置 media_* 工具, 不进 analysis |
| `mapnav` | 地图/导航类 AI 接口(设目的地+起导航) | bindAction + 目的地参数(name/lat/lon) |
| `carcontrol` | 车控服务 JSON functionId 契约 | ccDomain/ccFunction/bindAction |
| `intent` | 任意 app 页面直达(Form 1 startActivity; 组件/deep link uri/extras 皆可, 多屏可选) | component{pkg,cls} 或 intentScreens{byDisplay}; extras[{key,value/fromArgs}]; defaultArgs |

## 分析规范（判断标准 — 你的责任）

### 枚举能力
app 每个**对外可触发、可观测**的操作 = 一个 capability。漏一个 = 用户少一个工具；写错 sourceRef = 不可验证。宁可多列(probe)不可漏。

### description 规范（LLM 选工具的第一信号）
写**给上游 LLM 看**的，它不读源码：
- 触发场景对号入座："用户说'X'/'要Y'时用"——同类能力之间必须能区分（调音量 vs 切歌 vs 导航不可互相模糊）
- 枚举写 `值=含义`；范围写死（`0-31`）；单位注明
- 前置/互斥/关联写清楚（"先开总开关"、"不要与 XX 混用"）
**描述模糊 = LLM 幻觉选错工具**（弱描述下把 A 地名导成 B 地名的实测教训）。

### params 规范
- 类型/范围/optional 来自源码类型标注；设备注入值不进 params, 进 `app.deviceSources`。内置执行器当前解析 `vin`；新增设备源时须同步加入执行器 resolver
- enum 必须 wire 真实值（从源码/枚举定义逐字抽取, 不是展示名/中文名）——agent 按 schema 原样传值
- 对象/数组参数: 用 `properties`/`items` 展开内层形状(递归), 否则 agent 只能猜

### status 三态（诚实是可靠性的前提）
- `verified`: 源码核对过 wire 或**实测通过**
- `probe`: 推断合理但未实测（服务是否 exported、action 是否匹配、值域是否有效）
- `broken`: 已知 stub/no-op/不可达（serve 自动跳过, 不污染工具面）

## 验证协议（必须执行 — 用标准链自证有效）

产出后按序验证, 每条都要过:

1. **schema 校验**: `node "<skill目录>/validate-analysis.mjs" <analysis.json>` — 零错误
2. **Agent schema 导出**: `node "<套件根>/cli/bin/mcp-pipeline.js" schema --analysis <analysis.json> --out <function-schema.json> --format bridge`；数组参数必须导出为 `List[T]`，枚举必须落为 `options`
3. **运行时注入**: `node "<套件根>/cli/bin/mcp-pipeline.js" serve --analysis <analysis.json> --device <任意串>` 启动无异常；MCP `tools/list` 返回完整 `inputSchema`；工具数 = 非 broken capabilities + 4(media_*)
4. **端到端 schema 测试**: `node "<套件根>/e2e/schema-injection-smoke.mjs" --analysis <analysis.json> --report <schema-injection-report.json>` — BRIDGE 文件产物、MCP `tools/list`、OpenAI 与 Anthropic envelope 四层数量和字段一致
5. **契约核对**(有源码时): 逐字核对机制字段与 AIDL 声明——methodName 与 `.aidl` 方法名逐字一致、interfaceClass 全类名、override 实现/manifest 服务类/bindAction 三源一致（无现成 `validate_aidl` 工具时自写等效核对脚本，输出逐项检查清单）
6. **实测**(有设备/执行环境时): 对 `probe` 工具逐个 `invoke --op <id> --device <serial> [--args ...]`, 通过 → status 升 `verified`; 确定不可用 → `broken`; 结果写回 analysis
7. **报告**: 向用户说明 — 工具数、function schema 注入结果、机制分布、哪些 verified/probe/broken、验证证据、端到端自动演示结果（sessionId/LLM 回复摘要）、下一步(部署/实测)

无设备时: 1-4 必做, 6 留待有环境, status 保持 probe 并明确告知。

## 通用陷阱（逆向/分析时必须验证, 不要假设）

- **binder 契约以对端为准**: 事务码可能是**声明顺序**也可能是**字母序**(由编译工具决定) — 从对端(服务实现)的常量/onTransact 提取, 不要按惯例猜。接口方法、参数顺序、parcelable 字段顺序都须逐字对齐。
- **bind 的隐性要求**: 服务可能要求 intent action 匹配 filter; onBind 可能读 extra(如 packageName)做白名单 — 空则静默拦截(bind 成功但永不回调)。bindAction/permission 从 manifest intent-filter 提取; extra 要求从对端 onBind 字节码确认。
- **typed-parcelable 格式**: AIDL typed-parcelable 的 writeToParcel 带 size 前缀块 + 0/1 标记 — 手写复刻时缺一不可, 否则对端报 "Overflow in the size of parcelable"。
- **执行成功 ≠ 界面可见**: 许多 app 的 UI 刷新依赖进程内事件, 跨进程调用收不到 — description 不要承诺界面反馈; 界面操作是另一层能力(ui_* 兜底)的职责。
- **离线/云端依赖**: 车/设备无外网时云搜索/云服务不可用 — 依赖坐标/云查询的能力需兜底方案(内置字典/联网 geocode), description 注明。
- **标识符对不上**: 服务的真实 functionId/命令名可能与 SDK 常量/文档不同 — 以服务端注册表(handler/路由)为准。

## 流程（端到端总览 — 步骤可并行/重排，验证协议与收尾测试不可省）

1. 摸清输入形态 → 定位对外能力面(manifest/AIDL/服务/页面/媒体/functionId 清单)
2. 枚举能力 → 逐项定 id/params/status/mechanism
3. 写 description(触发场景模板)
4. 产出 analysis.json → CLI 确定性导出 function-schema.json（+ 可选 registry / app 侧 wire 配置）
5. 执行验证协议(七步) → 修正
6. 可视化跟随(--open 自动开浏览器, 会话上报实时点亮；见「可视化同步」)
7. 收尾自动端到端测试(全量套件, 失败自行优化；见「收尾」)
8. 报告(验证证据 + 测试通过率与覆盖统计 + 下一步)

## 可视化同步（适配层，默认开启；不影响执行流程）

执行各步时**顺带上报进度**（纯观察，不改变判断与产物）。地址 `BRIDGE_VIZ_URL` 默认 `http://127.0.0.1:8650`（置空该环境变量即关闭）；上报失败**静默忽略**，不阻断。

**开始执行 skill 时（必做）— 可视化跟本次输入走（通用，不绑定特定 app）**：

1. 复制 `<套件根>/viz/` 整体到 `<输入目录>/viz/`（输入目录不可写时放产物目录）；
2. 导出 `<产物目录>/function-schema.json` 后生成项目数据：`node <输入目录>/viz/gen.mjs <analysis.json> [<registry.json>]`（页面身份与数字由它驱动）；
3. 后台启动查看器（**必须带 `--open`：后端会在用户默认浏览器自动打开页面，不要让用户手动打开，也不要自行拼 shell 打开命令**）：
   `node "<输入目录>/viz/run.mjs" --open --suite-root "<套件根>" --project-root "<输入目录>" --analysis "<analysis.json>" --src "<输入目录>"`
   （端口默认 8650，被占用加 `--port 87xx` 并把 `BRIDGE_VIZ_URL` 指向实际地址；查看器经 `--suite-root` 复用套件的 CLI/校验器，不要求用户项目自带 cli/skills/e2e。`--open` 在无图形环境会静默失败——此时以文字告知页面地址即可。）

页面自带端到端测试入口（同源 `/e2e/cockpit`：网关与依赖由后端自动拉起，缺 LLM key 时页面会向用户询问）——skill 无需、也不应另行启动网关。

**上报协议**（每步开始/结束都发，失败静默）：
- 会话开始：`POST $BRIDGE_VIZ_URL/api/session/start` `{"name":"bridge-analyze · <app>"}`
- 步事件：`POST $BRIDGE_VIZ_URL/api/session/event` `{"stage":"n1","status":"running|done|skipped","msg":"<该步真实结论>"}`
- 节点：`n1` 输入形态 / `n2` 枚举能力 / `n3` 产出·校验 / `n4a` serve 投影 / `n4b` registry / `n5` 车端部署·自检 / `n6` 实测
- `msg` 写**真实结论**（如 "枚举 29 caps，methodName 逐名核对 21/21"），不写台本；`skipped`（如车离线）注明原因。

**收尾 · 自动端到端测试（验证协议通过后必做 — 全自动）**：

1. **构造全量测试集**（由你按本次 analysis 现构 — 模拟真实座舱用户语音指令、以发现问题为导向；**不要写死成脚本或固定查询清单**）。覆盖维度：
   - **工具**：全部非 broken capabilities 各 ≥1 条（套件大时按 domain/object 分层，目标仍是全覆盖）；
   - **状态**：带 enum 的工具覆盖多个取值；readonly 与 normal 都测；
   - **复合长难句**：多意图一句（如"调小声顺便切个安静的模式"）、口语指代/纠偏、长句噪音，各 domain ≥1 条；
   - **近义区分**：语义相近的能力对互造易混指令，验证 description 区分度；
   - **防幻觉**：≥2 条与能力面无关的指令，`expectTool` 填 `"none"` — 期望不调用任何工具，选中即判失败；
   - query 必须自包含可执行：参数带具体值、不写占位符、不用会诱发"追问参数/先查再改"的歧义表述。query 首选取自各 capability `description` 的触发场景原句，其余按上述维度生成。
2. **分批执行**：`POST $BRIDGE_VIZ_URL/api/e2e/test` body `{"tests":[{"message":"…","expectTool":"<id>|none|省略"},…]}`，**每批 ≤12 条**同步返回逐条判定；全量套件分多批顺序提交。测试开始即自动把用户页面切到 cockpit：逐轮自动跟随实时展示 + 进度条 ✓/✗（不写管线日志）。接口返回 `needsKey` 时页面向用户询问 key。
3. **失败即自行优化**：✗（未选中期望工具 / none 却调用了工具）= 对应 description 区分度不足 → 改写 description → 重新导出 function-schema → `POST $BRIDGE_VIZ_URL/api/e2e/restart`（网关按新 analysis 重建配置）→ **仅重测失败项**（≤2 轮）。执行类错误（如设备不可达）属环境问题，如实呈现并说明，不算描述失败。
4. **报告**：通过率、覆盖统计（工具数/状态数/复合句/近义陷阱/防幻觉）、发现的问题与修正记录。

## 产物去向

`function-schema.json` 可直接交付上游 Agent；同一 schema 在 `serve` 时通过 MCP `tools/list` 动态注入，并由 E2E gateway 转换为 OpenAI/Anthropic function envelope（收尾自动测试验证的正是这条注入链）；机制字段经 `analysis-to-registry` 生成车端 registry；app 侧 wire 配置（如适用）部署到目标 app 执行端即可驱动真机。全部产物的配对关系在可视化页「配对矩阵」中呈现与核对。
