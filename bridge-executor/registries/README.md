# bridge_executor registries (per-app 能力面)

执行器从 `filesDir/registry.json` 读一份 registry 来分派工具。机制(`mechanism`)有三类:

| mechanism | 用途 | 需 bind AIDL | 返回 |
|---|---|---|---|
| `aidl` | 反射调目标 app 现有 AIDL service(Form 2, 真执行+真数据) | 是(registry 顶层 `servicePackage/serviceClass`) | 双向 RPC |
| `media` | MediaController 控活跃媒体 session(切歌/播放/暂停) | 否(内置 `media_*`) | SUCCESS/NO_SESSION |
| `intent` | **startActivity 页面跳转**(Form 1, fire-and-forget; 如 CarControl 空调/座椅/灯光) | 否 | launched=true(单向) |

## intent 工具 schema(`carcontrol-registry.json` 为样例)

registry 顶层:
- `intentScreens` { `pkg`, `byDisplay`: { `DRIVER`/`PASSENGER`/`REAR` → Activity class } } — 同一页可落到不同物理屏。

每个 intent tool:
- `component` { `pkg`, `cls` } — 显式目标(可选; 缺省则用 `intentScreens` 按 `display` 解析 class)。
- `extras` [ { `key`, `fromArgs`? | `value`? } ] — `fromArgs:true` 表示把合并后的 args 序列化成 JSON 作为该 extra 的值(如 CarControl 的 `ToCarControl` = `{"type":...,"subTabName":...}`)。
- `args` — 默认参数(调用方同 key 覆盖; `displayArg` 指定的键不入 JSON)。
- `displayArg` / `displayDefault` — 选屏参数名与默认屏。

## 选屏(display)
执行器 `resolveDisplayId(name)` 用 `DisplayManager` 按屏名(`DRIVER/PASSENGER/REAR`)匹配 displayId, 命中则 `ActivityOptions.setLaunchDisplayId` 落到对应物理屏; 未命中则当前屏。
> ⚠️ 车机实际屏名(Display.getName)需**车端核对**; 不匹配时回退当前屏。

## 部署
把需要的 registry(可多 app 合并成一份)推到执行器 `filesDir/registry.json`(`adb push` 到 `/data/user/10/com.immotors.bridge.executor/files/registry.json` 或 scoped 路径)。aidl 工具仍按顶层 `servicePackage/serviceClass` bind; intent 工具自包含、不依赖该 bind。

## 局限
intent 是**单向 action**(跳页, 不回状态)。带状态/带返回的控制(如"温度设到 22""按摩 3 档")仍需 Form 2 的 AIDL/CarProperty, 不要用 intent 伪装成可查询的能力。
