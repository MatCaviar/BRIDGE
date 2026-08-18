---
name: bridge-analyze
description: 任意应用(源码/PRD/APK/行为观察) → 上游 Agent 能力调用 schema(analysis.json)。用于 host codeagent: 自主分析一个应用, 产出可被 MCP serve 直接投影给 LLM agent 的工具 schema, 并完成验证。当用户给一个 app(目录/文档/APK) 并要求产出能力清单/工具 schema/agent 可调接口时使用。替代旧版 mcp-analyze(面向 scaffold 重流程, 与 E2E serve 规格不对齐)。
---

> 🌐 默认用中文与用户交互和输出；代码/命令/标识符/文件名保持英文。

# bridge-analyze — 应用 → 上游 Agent 能力调用 Schema

本 skill 由 **host codeagent 自主执行**：输入任意应用的信息，产出 `analysis.json`（上游 LLM agent 可直接调用的能力 schema），并自主完成验证。**你(执行 agent)拥有完全自主性**——按下方契约产出，用标准验证链自证有效，不要等用户补充上下文。本文档是自包含的：所有判断标准、输出规格、验证手段都在这里。

## 输入 → 输出契约

**输入**（用户给什么用什么，可组合）：
- 应用源码目录（Android/Kotlin+AIDL、TypeScript、其他语言）
- PRD / 接口文档 / manifest / AIDL 文件
- APK / 安装包（可逆向：dex、manifest、resources）
- 运行环境（adb 设备、日志、行为观察）

**输出**：`analysis.json`（必须）+ 可选 `registry.json`（执行器配置，由 analysis 推导）。
- serve 投影：`capabilities[].id/description/params/status` → MCP 工具 + inputSchema（LLM 直接可见）
- 车端执行：`capabilities[].mechanism` 等机制字段 → registry（一份产物双用；serve 忽略多余字段）
- CLI 基准：`node <插件>/cli/bin/mcp-pipeline.js <subcmd>`（`validate`/`serve`/`invoke`/`validate_aidl`；${CLAUDE_PLUGIN_ROOT} 可作插件根）

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
      "ccDomain": "002", "ccFunction": "func_id"  // carcontrol 专用
    }
  ]
}
```

**机制选择**（从 app 对外形态判断；拿不准 → 选最可能 + status=probe）：

| mechanism | 适用形态 | 关键字段 |
|---|---|---|
| `execmd` | AIDL 单入口 executeCommand 式(命令名+参数JSON) | methodName/pattern/dataClass/devicePaths |
| `media` | 媒体会话控制(切歌/播放/暂停, 任意媒体 app) | 内置 media_* 工具, 不进 analysis |
| `mapnav` | 地图/导航类 AI 接口(设目的地+起导航) | bindAction + 目的地参数(name/lat/lon) |
| `carcontrol` | 车控服务 JSON functionId 契约 | ccDomain/ccFunction/bindAction |
| `intent` | 页面跳转(Form 1 startActivity) | component/intentScreens |

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
- 类型/范围/optional 来自源码类型标注；设备注入值(vin/token/uid)不进 params, 进 `app.deviceSources`
- enum 必须 wire 真实值（从源码/枚举定义逐字抽取, 不是展示名/中文名）——agent 按 schema 原样传值
- 对象/数组参数: 用 `properties`/`items` 展开内层形状(递归), 否则 agent 只能猜

### status 三态（诚实是可靠性的前提）
- `verified`: 源码核对过 wire 或**实测通过**
- `probe`: 推断合理但未实测（服务是否 exported、action 是否匹配、值域是否有效）
- `broken`: 已知 stub/no-op/不可达（serve 自动跳过, 不污染工具面）

## 验证协议（必须执行 — 用标准链自证有效）

产出后按序验证, 每条都要过:

1. **schema 校验**: `node "<skill目录>/validate-analysis.mjs" <analysis.json>`(本 skill 自带的规格校验器, 对齐 E2E serve 规格; 旧插件 validate 面向 scaffold 流程, 与新规格不兼容, 勿用) — 零错误
2. **serve 加载**: `node <cli>/bin/mcp-pipeline.js serve --analysis <analysis.json> --device <任意串>` 启动无异常; 工具数 = 非 broken capabilities + 4(media_*)（用 MCP client 或日志确认）
3. **契约核对**(有源码时): `validate_aidl <registry.json> <aidlDir> <adapter> <types>` — 机制字段与 AIDL 一致
4. **实测**(有设备/执行环境时): 对 `probe` 工具逐个 `invoke --op <id> --device <serial> [--args ...]`, 通过 → status 升 `verified`; 确定不可用 → `broken`; 结果写回 analysis
5. **报告**: 向用户说明 — 工具数、机制分布、哪些 verified/probe/broken、验证证据、下一步(部署/实测)

无设备时: 1+2 必做, 4 留待有环境, status 保持 probe 并明确告知。

## 通用陷阱（逆向/分析时必须验证, 不要假设）

- **binder 契约以对端为准**: 事务码可能是**声明顺序**也可能是**字母序**(由编译工具决定) — 从对端(服务实现)的常量/onTransact 提取, 不要按惯例猜。接口方法、参数顺序、parcelable 字段顺序都须逐字对齐。
- **bind 的隐性要求**: 服务可能要求 intent action 匹配 filter; onBind 可能读 extra(如 packageName)做白名单 — 空则静默拦截(bind 成功但永不回调)。bindAction/permission 从 manifest intent-filter 提取; extra 要求从对端 onBind 字节码确认。
- **typed-parcelable 格式**: AIDL typed-parcelable 的 writeToParcel 带 size 前缀块 + 0/1 标记 — 手写复刻时缺一不可, 否则对端报 "Overflow in the size of parcelable"。
- **执行成功 ≠ 界面可见**: 许多 app 的 UI 刷新依赖进程内事件, 跨进程调用收不到 — description 不要承诺界面反馈; 界面操作是另一层能力(ui_* 兜底)的职责。
- **离线/云端依赖**: 车/设备无外网时云搜索/云服务不可用 — 依赖坐标/云查询的能力需兜底方案(内置字典/联网 geocode), description 注明。
- **标识符对不上**: 服务的真实 functionId/命令名可能与 SDK 常量/文档不同 — 以服务端注册表(handler/路由)为准。

## 流程（自主编排, 不必照抄顺序）

1. 摸清输入形态 → 定位对外能力面(manifest/AIDL/服务/页面/媒体/functionId 清单)
2. 枚举能力 → 逐项定 id/params/status/mechanism
3. 写 description(触发场景模板)
4. 产出 analysis.json(及可选 registry)
5. 执行验证协议 → 修正 → 报告

## 与旧版/生态的关系

产物直接 `serve`(E2E 兼容)。旧 scaffold/generate/curate/test skill 保留给需要完整 server 生成的项目; 本 skill 只负责"分析 → schema → 验证"这一环, 不依赖其他 skill。
