# 方向1：系统级跳转泛化设计

**日期**: 2026-06-22
**状态**: 设计已批准，待实现
**前置**: 单点 launch_app（imaudio）已完成并验证
**范围**: launch_app 从 imaudio 单目标 → 多目标系统级跳转

---

## 1. 背景与目标

### 背景
应用内功能（equalizer/soundstage 等）走应用 kdbus，被车机系统权限阻断（见 D-Bus 泛化 spec 的 `Invalid Session`/`Access denied` 障碍）。

但**系统级跳转**（sendlink）可用——adb shell 有权执行系统命令。应用代码里有多个 `page://` 跳转目标（启动不同应用/页面）。

### 目标
扩展 `launch_app` 支持多个系统级跳转目标，复用已验证的 sendlink 机制。

---

## 2. 约束

- **复用 sendlink**（adb-executor 已注册的 sendlink 命令，已验证可用）
- **首版 3 个无参目标**：imaudio（已有）/ lightpoint / smartcar
- **xinger 后续**：需 cpid 参数，首版跳过，下版加可选 params
- **不走 D-Bus**：全部系统级 sendlink（绕过 kdbus 权限）
- **YAGNI**：不做应用内功能（D-Bus 受阻，另行讨论）

---

## 3. 已验证的事实

### 3.1 sendlink 机制（已验证）
`adb -host shell sendlink page://<host>/<path>` → `SUCCESS` + 实机跳转。adb shell（root）有权。

### 3.2 应用代码的跳转目标（grep 确认）
| appName | page:// URI | 参数 |
|---------|-------------|------|
| imaudio | `page://imaudio.yunos.com/imaudio` | 无 |
| lightpoint | `page://lightpoint.yunos.com/ShowRoomPage` | 无 |
| smartcar | `page://smartcar.ivi.com/smartcar` | 无 |
| xinger | `page://xinger.alios.cn/<cpid>` | 需 cpid（首版跳过） |

---

## 4. 设计

### 4.1 架构（复用 sendlink）
```
launch_app(appName) tool
  → yunos-adapter.launchApp(appName)
  → 查 APP_PAGE_URI 映射 → page:// URI
  → adb-executor.execute("sendlink", { url })   ← 已有命令
  → adb -host shell sendlink <uri>
  → 实机跳转
```

### 4.2 映射表（代码 const）
```typescript
const APP_PAGE_URI: Record<string, string> = {
  imaudio: "page://imaudio.yunos.com/imaudio",
  lightpoint: "page://lightpoint.yunos.com/ShowRoomPage",
  smartcar: "page://smartcar.ivi.com/smartcar",
};
```
yunos-adapter.launchApp 查表；未知 appName 返回错误。

### 4.3 改动（3 处）
1. **analysis.json**：launch_app capability 的 `appName` enum 扩展为 `["imaudio", "lightpoint", "smartcar"]`
2. **yunos-adapter.ts**：加 `APP_PAGE_URI` 映射表；`launchApp` 改为查映射（当前硬编码 imaudio）
3. **mock-adapter.ts**：`launchApp` 兼容多 appName（返回模拟 success）

### 4.4 launch.ts（tool 注册）
inputSchema 的 `appName` enum 跟随 analysis.json 扩展（或代码内同步）。

---

## 5. 数据流（以 lightpoint 为例）
```
LLM "打开秀场" → launch_app(appName="lightpoint")
  → yunos-adapter.launchApp("lightpoint")
  → APP_PAGE_URI["lightpoint"] = "page://lightpoint.yunos.com/ShowRoomPage"
  → adb-executor.execute("sendlink", {url})
  → adb -host shell sendlink page://lightpoint.yunos.com/ShowRoomPage
  → SUCCESS + 实机跳转秀场页
```

---

## 6. 错误处理

- 未知 appName → `{success:false, error:"unknown app: <name>"}`
- sendlink 失败 → 沿用现有 adb-executor 错误处理

---

## 7. 验收标准

- [ ] APP_PAGE_URI 映射表（3 目标）
- [ ] analysis.json appName enum 扩展（3 目标）
- [ ] yunos-adapter.launchApp 查映射（不硬编码 imaudio）
- [ ] mock-adapter 兼容多 appName
- [ ] **端到端**：launch_app("lightpoint") / ("smartcar") → 实机真实跳转（用户确认）
- [ ] launch_app("imaudio") 不回归

---

## 8. 不做（YAGNI / 后续）

- ❌ xinger（需 cpid params，下版加可选参数支持）
- ❌ PageLink 的 setParam（stop_page_strategy/bmCallerURI 等，首版无参跳转）
- ❌ 应用内功能（equalizer 等，D-Bus 受阻，另行讨论）
- ❌ 动态发现车机所有 page://（首版用代码内固定映射表）
