# 真实 ADB 执行层设计：从单点接入到应用代码泛化

**日期**: 2026-06-17
**状态**: 设计已批准（grill review 后修订 v2），待实现
**范围**: 单点功能（launch_app tool）+ 泛化架构（D-Bus 已验证）

---

## 1. 背景与目标

### 当前状态
- `im-mcp-codeagent` 已能从 `analysis.json` 生成 MCP server（含 mock adapter）
- 生成的 server 有 `IAdapter` 双实现：`mock-adapter.ts`（假数据）+ `yunos-adapter.ts`（真实执行 stub）
- e2e-test-runner 用 LLM agent 调用这些 server 的 mock 工具做测试
- **缺**：真实执行层 —— server 无法操作硬件实机

### 目标
1. **单点（当前）**：在 `mcp-imaudio` 新增 `launch_app` tool，真正在车机上启动 imaudio 应用
2. **泛化（后续）**：
   - 单点 → imaudio server 全部功能
   - imaudio server → 所有 server
   - 终极：从任意自研应用代码（+ PRD）自动生成 MCP schema、server、真实执行、测试链

---

## 2. 约束

- **模型/MCP server 不变**：不改 LLM、不卸载已加载的 MCP server
- **泛化方向已定**：命令映射从**应用代码反推**（已验证可行，见 §3.2/§5）
- **配置全部用配置文件，禁止环境变量**（用户硬性要求）
- **YAGNI**：单点只做 `launch_app`（sendlink），其余 tool 留 stub
- **扩展性**：单点实现必须为泛化留好接口，不可一次性硬编码

---

## 3. 已验证的事实（探索 + grill 结论）

### 3.1 adb 环境
- **adb 身份**：`Adb tool for YunOS 5.0.41`（阿里 YunOS 定制 adb）
- **来源位置**：`C:\Users\matca\AppData\Local\ZebraAlfred\adb\`
  - `adb.exe` + `AdbWinApi.dll` + `AdbWinUsbApi.dll`（三件套）
- **`-host` 选项**：YunOS 定制选项，实测有效
- **单点命令已验证**：`adb -host shell sendlink page://imaudio.yunos.com/imaudio` → SUCCESS + 实机打开

### 3.2 应用代码通信链（泛化反推依据）—— grill 已验证
```
Model → Manager → Proxy → BaseProxy → UBus(D-Bus) → 系统服务
```
- 应用代码：`D:\IM\imaudio_app_code\ts\`
- **BaseProxy 用 `new UBus("dbus")`** —— UBus 是 YunOS 对 **D-Bus** 的封装
- 每个 Proxy 携带 D-Bus 三元组：`busName`(如 `imaudio.alios.cn`) + `busPath`(如 `/imaudio/alios/cn`) + `interface`(如 `imaudio.alios.cn.interface`)
- **车机已验证有完整 D-Bus 工具链**：`/usr/bin/dbus-send`、`dbus-monitor`、`busctl`、`dbus-daemon`
- → **adb 可复现任意能力调用**：`adb -host shell dbus-send --dest=<busName> <busPath> <interface>.<method> <typed-args>`
- `analysis.json` 每个 capability 已含 `sdkCalls` 和 `sourceRef`（源码定位，用于反推 method 名）

### 3.3 改造对象已存在
- `mcp-imaudio` server 已生成：`D:\IM\im-mcp-codeagent\mcp-imaudio\`
- 含 `src/adapters/{mock-adapter.ts, yunos-adapter.ts, types.ts, index.ts}`
- 现有 18 个 tool 全是音频操作，**无启动应用 tool** → 单点需新增 `launch_app`

### 3.4 配置机制已存在（YAML）
- 配置文件：`mcp-imaudio/conf/config.yaml`
- 读取：`src/config.ts` 用 `readFileSync` + `__dirname`（已有 `dirname(fileURLToPath(import.meta.url))`）
- **契合「禁止环境变量」**：扩展此 YAML + `ServerConfig` 接口即可

---

## 4. 单点设计

### 4.1 功能定义
- **新增 capability**：`launch_app(appName)` 加入 `imaudio-analysis.json`（走标准生成链 → schema + server tool + e2e system prompt，LLM 可见）
- **功能**：执行 sendlink 启动应用（`page://<appName>.yunos.com/<appName>`）
- **触发链**：LLM 调用 `launch_app` → `yunos-adapter.launchApp()` → `adb-executor.execute("sendlink", ...)` → adb → 实机

### 4.2 新增组件

#### `adb-executor.ts`（核心，通用执行器）
**命令模式注册表设计**（非 sendlink 专用，为 D-Bus 泛化留口）：
```typescript
type CommandHandler = (args: Record<string, unknown>) => string;  // 返回 adb 参数串
const commandRegistry = new Map<string, CommandHandler>();
function registerCommand(name: string, handler: CommandHandler): void;
async function execute(commandName: string, args: Record<string, unknown>): Promise<ExecResult>;
interface ExecResult { success: boolean; rawOutput: string; parsed?: unknown; }
```
- 单点注册 `sendlink`：`registerCommand("sendlink", ({url}) => "shell sendlink " + url)`
- 泛化时注册 `dbus-call`：`registerCommand("dbus-call", ({busName,busPath,iface,method,args}) => "shell dbus-send ...")`
- **adb 路径来自配置**（见 §4.4），不读环境变量

#### adb 工具自包含（项目级）
- adb 是 YunOS 通用工具、与应用无关 → 拷到**项目级** `im-mcp-codeagent/tools/adb/`（多 server 共享）
- 三件套：`adb.exe` + `AdbWinApi.dll` + `AdbWinUsbApi.dll`

#### `launch_app` capability + adapter 改造
- **analysis.json**：加 `launch_app` capability（params: `appName` enum 含 `imaudio`）→ 生成链自动产出 schema + server tool + system prompt 项
- **yunos-adapter**：实现 `launchApp(appName)` → `adbExecutor.execute("sendlink", { url: "page://"+appName+".yunos.com/"+appName })`
- **mock-adapter**：`launchApp` 返回模拟成功（e2e 不依赖实机）
- **其余 yunos-adapter 方法保持 stub**，返回结构化「未实现」错误（见 §7），**不抛异常**

### 4.3 数据流（单点）
```
LLM → MCP tool launch_app(appName="imaudio")
  → yunos-adapter.launchApp("imaudio")
  → adbExecutor.execute("sendlink", {url:"page://imaudio.yunos.com/imaudio"})
  → commandRegistry["sendlink"] → "shell sendlink page://imaudio.yunos.com/imaudio"
  → subprocess: <config.adb.path> -host shell sendlink <url>
  → 解析 "SUCCESS: {...}" → ExecResult{success:true, parsed:{targetPageId}}
  → 返回 LLM → 实机打开
```

### 4.4 配置（YAML，禁止环境变量）
扩展 `mcp-imaudio/conf/config.yaml`：
```yaml
adapter:
  mock_mode: false        # false=yunos(真实) / true=mock
adb:
  path: "../../tools/adb/adb.exe"   # 项目级 adb
  use_host: true          # YunOS -host 选项
  timeout_ms: 10000
```
- **路径解析基准**：`config.ts` 用已有 `__dirname` 把 `adb.path` 解析为**绝对路径**（不依赖 server 运行时 cwd，可靠）
- 扩展 `ServerConfig` 接口加 `adb` 字段；**全程零环境变量**

### 4.5 mock_mode 混合模式
- e2e-runner 同时启动 imaudio/aipet/hvac，各 server 独立 config → 单点只让 imaudio `mock_mode:false`，其余保持 mock
- LLM 按用户意图调用 tool，混合模式可共存

---

## 5. 泛化架构（D-Bus 已验证，扩展点不在单点实现）

### 5.1 反推锚点：BaseProxy 的 D-Bus 调用
所有能力收口于 BaseProxy → UBus(D-Bus)。泛化命令模式：
```
adb -host shell dbus-send --dest=<busName> <busPath> <interface>.<method> <typed-args>
```
- `busName`/`busPath`/`interface`：从应用代码 Proxy 子类构造参数提取
- `method` + 参数：从 capability 的 `sdkCalls`/`sourceRef` 反推
- 在 `adb-executor` 注册 `dbus-call` 命令模式

### 5.2 生成链全景
```
应用代码 (imaudio_app_code)              ← 输入源
   │  静态分析 Model→Manager→Proxy→BaseProxy (D-Bus 三元组)
   ▼
analysis.json (sdkCalls + sourceRef)     ← 能力规范（已有）
   │
   ▼
MCP schema + server (im-mcp-codeagent)   ← 生成（已有）
   │  yunos-adapter 每方法 = 一个 capability
   ▼
adb-executor (命令模式注册表)            ← 单点新增，泛化填充
   │  sendlink(单点) / dbus-call(泛化)
   ▼
真实车机 + e2e 测试链                     ← 已有
```

### 5.3 单点为泛化预留的 3 个扩展点
1. **adb-executor 注册表**：新增命令模式只需 `registerCommand`
2. **yunos-adapter 方法 ↔ capability 一一对应**：泛化时批量填充
3. **`capability → adb 命令`映射可配置**：不同应用可替换映射规则

---

## 6. 泛化阶段的关键待解（不在单点做）

| 待解项 | 何时解 | 阻塞什么 |
|--------|--------|----------|
| D-Bus **类型签名**（`string:`/`int32:`/...）如何从应用代码推导 | 泛化 imaudio 全功能时 | `dbus-call` 的参数序列化 |
| 从应用代码自动提取 D-Bus 三元组（busName/busPath/interface） | 泛化到「自动生成」时 | 终极自动化生成链 |

> 注：泛化**机制**（D-Bus via dbus-send）已验证可行；待解的是参数序列化的自动化提取，属工程量问题，非可行性风险。

---

## 7. 错误处理（单点）

- adb 不存在 / 配置 path 错误 → `{success:false, error:"adb not found at <path>"}`
- adb 执行失败（非 0 退出 / 非 SUCCESS）→ `{success:false, rawOutput}`，不重试（YAGNI）
- subprocess 超时 → 按 `adb.timeout_ms` 超时
- **yunos stub 方法被调用** → 返回 `{success:false, error:"not implemented: <method>"}`（结构化、不抛异常，server 稳定 + LLM 清晰反馈）

---

## 8. 验收标准（单点）

- [ ] adb 三件套拷入项目级 `im-mcp-codeagent/tools/adb/`
- [ ] `imaudio-analysis.json` 新增 `launch_app` capability
- [ ] `config.yaml` 扩展 `adb` 段 + `mock_mode` 切换；`config.ts` 用 `__dirname` 解析 adb.path 为绝对路径（零环境变量）
- [ ] `adb-executor.ts`：注册表 + sendlink + subprocess + 结果解析
- [ ] `launch_app` 经生成链产出（schema + server tool + system prompt 项）；`yunos-adapter.launchApp()` 调 adb-executor；mock-adapter 返回模拟
- [ ] yunos stub 方法返回结构化「未实现」错误，不抛异常
- [ ] **端到端**：`mock_mode:false` 时 e2e-runner 触发 `launch_app("imaudio")` → 实机真实打开（用户确认）
- [ ] 其余方法 stub，server 正常启动
- [ ] 注册表验证：新增命令模式只需 `registerCommand`

---

## 9. 不做（YAGNI）

- ❌ equalizer/soundstage 等音频功能真实执行（泛化阶段）
- ❌ D-Bus 类型签名自动推导（泛化阶段）
- ❌ 命令重试、异步、多设备切换
- ❌ 自动从应用代码生成映射（终极阶段）
- ❌ 任何环境变量配置
