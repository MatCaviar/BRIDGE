> 本文档中的 `D:\IM\...` 为交接机的绝对路径；仓库内对应结构：`e2e/`（网关与配置）/ `bridge-executor/`（执行器源码）/ `skills/bridge-analyze/`（重构版 skill）/ `tools/`（脚本与车控清单）/ `handoff/`（本文档）。

# BRIDGE 座舱智能体 — 移交说明 (Handoff)

> 给接手的同事: 这是什么、在哪里、怎么跑、现在到哪了、坑在哪。读完这份能接着干; 深入设计读 `../CONTEXT.md` 和 `../docs/`。下一步直接看 [`NEXT_STEPS.md`](./NEXT_STEPS.md)。

---

## 0. TL;DR

把**车机 app 的对外能力**确定性地变成 **MCP 工具集**, 本地 PC 用**语音智能体**调用, 真正驱动车机(不是 mock)。

- 已封装并 host 端验证: **imaudio 23 个 AIDL 能力** + **媒体切歌 4 个**(media 机制)。
- 已阻塞: **车端端到端**要等车可用; 导航/车控等待加。
- 下一步主线: **把更多车机能力封进一个 bridge_executor**, 然后**本地端到端**跑通 语音→车。

---

## 1. 架构(30 秒)

```
🎤 语音 → cockpit.html → mcp-gateway(LLM + MCP 编排)
                                   ↓ stdio
                              serve(MCP server, host PC)
                                   ↓ invoke(D-step)
                              [adb] 写 cmd.json + am start
                                   ↓
            车端 bridge_executor (com.immotors.bridge.executor, system priv-app)
                                   ↓ bind 显式组件 + 反射
                         目标 app 现有 AIDL service / MediaController
                                   ↓
                              真实车机操作 → result.json → 回传显示 + TTS
```

**关键决策(ADR 0001)**: MCP server 跑在 host PC, **车端只放薄执行器**; **目标 app 零改动**(bind 它现有的 AIDL + 反射调原方法)。加新 app = 给 bridge 加它的 `.aidl` + registry, 不碰那个 app。

---

## 2. 组件清单

| 组件 | 路径 | 作用 | 状态 |
|---|---|---|---|
| BRIDGE 插件 (im-mcp-codeagent 0.1.8) | `C:\Users\matca\.claude\plugins\cache\im-mcp-marketplace\im-mcp-codeagent\0.1.8` | MCP 套件生成 pipeline (analyze→scaffold→generate→gates→build→serve/invoke) | ✅ 权威缓存, 勿改 |
| **bridge_executor** (车端执行器) | `D:\IM\im_android_8797_app_code\_unzipped\imaudio_app_compose-master\bridge_executor` | `com.immotors.bridge.executor`, bind 目标 AIDL + media; 读 registry.json 分派 | ✅ 代码完, APK 已 build, 待部署上车 |
| **mcp-gateway** (PC host) | `D:\IM\mcp-gateway` | LLM client(Qwen) + MCP 编排 + web dashboard + cockpit | ✅ 跑通, 主入口 |
| cockpit App | `mcp-gateway\dashboard\cockpit.html` | 点阵 WebGL 动画 + 语音 + 全量状态面板 | ✅ 路由 `/cockpit` |
| 本地 ASR | `D:\IM\asr-whisper-server.py` + venv `D:\IM\asr-whisper` | faster-whisper 中文识别(无 key/无外网) | ✅ 验证 3/3, 端口 8765 |
| 配置 | `mcp-gateway\config-cockpit.yaml`, `bridge-analysis.json` | qwen3.5-flash + serve(25 工具) | ✅ |
| 设计/决策 | `D:\IM\bridge_test\CONTEXT.md`, `docs\adr\`, `docs\superpowers\` | 术语 / ADR / 计划 / spec | ✅ 先读 |

---

## 3. 怎么跑(本地 cockpit, 不需要车)

两个服务, 各开一个终端窗口别关:

```bash
# 1) 本地 ASR(先起, 模型已缓存 ~15s 就绪)
D:\IM\asr-whisper\Scripts\python.exe D:\IM\asr-whisper-server.py
#   看到 "Uvicorn running on http://127.0.0.1:8765" 即就绪

# 2) mcp-gateway + cockpit
set QWEN_API_KEY=<YOUR_DASHSCOPE_KEY>
cd /d D:\IM\mcp-gateway
npm run dashboard -- --config config-cockpit.yaml
#   看到 "MCP Gateway Dashboard running at http://localhost:3000"
```

浏览器开 `http://localhost:3000/cockpit` → 点 🎤 说中文。
(LLM 走 DashScope qwen3.5-flash; ASR 本地 whisper 不联网。)

> 两个服务都得开着, 缺一个语音就断。当前会话会回收后台进程, **自己开终端窗口常驻**最稳。

---

## 4. 怎么重建/重部署车端执行器

- **代码**: `bridge_executor\src\main\java\com\immotors\bridge\executor\ExecutorActivity.kt`
  - `dispatch`: `aidl`(反射调目标 service 原方法) / `media`(MediaController 切歌)
  - 分派 pattern: `none`/`scalar`/`dataclass`/`envelope`(后者构造 {body,headers,options} + devicePaths 注入 vin)
- **签名**: `keystore\8797_platform.jks` (storePassword/keyPassword `<KEYSTORE_PASSWORD>`, keyAlias `8797`), 作 system priv-app
- **build** (用 Android Studio 自带 jbr 作为 JAVA_HOME; **改 .kt 后必须 `clean` 重建**, 增量会吃旧 dex 缓存):
  ```bash
  cd D:\IM\im_android_8797_app_code\_unzipped\imaudio_app_compose-master
  .\gradlew clean :bridge_executor:assembleDebug
  # 产物: bridge_executor\build\outputs\apk\debug\bridge_executor-debug.apk (~2.5MB)
  ```
- **部署上车**(车封 sideload, 只能走 system 分区 + 重启, 见 memory `car-execution-constraints`):
  root push 到 `/system/priv-app/bridge_executor/` → reboot。前台用户 = **user 10**; 信箱 = app `filesDir/imrpc`(cmd.json/result.json/registry.json)。
- **registry**: 执行器从 `filesDir/registry.json` 读(per-app: servicePackage/serviceClass + tools[op→methodName+pattern+devicePaths+mechanism])。换 registry = 换目标 app。

---

## 5. 现在的验证状态(诚实)

| 项 | 状态 |
|---|---|
| 本地全链(无车): 语音→ASR→LLM 选工具→serve 暴露 25 工具 | ✅ |
| LLM 正确选 + 调 `set_car_and_headrest_volume(volume:15,streamType:0)` | ✅ |
| 本地 ASR: 真实中文指令 3/3(edge-tts 验证) | ✅ |
| **imaudio 23 个工具 execmd 全打通**(2026-08-17, 修复 AIDL 顺序 + `params` wire 后全模式真数据) | ✅ |
| **媒体切歌 4 件套上车验证**(2026-08-17, priv-app 部署后, 控制 QQ 音乐 `cn.alios.audioapp.qq` 真实切歌/播放/暂停) | ✅ |
| **导航**(2026-08-17, `nav_start` → BanmaMap common 接口 `navigateToForAI`, 同济大学/虹桥机场/西湖验证成功; geo_search 联网解析坐标) | ✅ |
| **车控**(2026-08-17, `cc_*` → CarControlService CustomService, 座椅加热/加热档位/通风/按摩/热石) | ✅ |
| **App 型能力**(2026-08-17, bridge-ui: ui_launch/ui_dump/ui_tap_text 等 8 工具, 按文本驱动任意 app 界面, 实测打开无麦K歌页/关弹窗/选音源) | ✅ |
| **E2E 语音闭环**(2026-08-17, ASR→LLM→38 工具→车, 全部核心场景实测绿) | ✅ |
| 车控全量扩展(500+ functionId 已枚举, 待批量 registry) | ⏳ 机制就绪, 待扩展 |

**2026-08-17 车端修复记录(重要):**
- **AIDL 顺序 bug**: bridge 的 `IIMAudioService.aidl` 原来只声明 `executeCommand` → 事务码落在 1(车的 `registerCallback`) → "Parcel data not fully consumed, unread size: 104"。修复 = 按车的顺序声明 `registerCallback(1)/unregisterCallback(2)/executeCommand(3)`。
- **execmd wire bug**: 车端 v1 dispatcher 用 Gson 解析 `Command(callerId, command, params)` — 参数键是 **`params`**, 不是 `jsonRequest`! 原来发 `jsonRequest` → `params` 为 null → "fromJson(...) must not be null"。修复 = 执行器 `dispatchExecCmd` 发 `{"command":..., "params":...}`(源码见 `ExecutorActivity.kt:250`)。

---

## 6. 已知坑(Gotchas)— 必读

- **DashScope key 只有文本 LLM 权限**, 无任何音频模型(paraformer/sensevoice/qwen-audio 全 `Model.AccessDenied`)。所以 **ASR 走本地 whisper**, 不走云。
- **本地 whisper 在 CN 网络**: 必须设 `HF_ENDPOINT=https://hf-mirror.com` + `HF_HUB_DISABLE_XET=1`(脚本里已设), 否则模型下不下来(TLS reset / Xet 401)。模型缓存 `D:\IM\asr-whisper\hf-cache`(~480MB)。
- **车封 sideload**: `adb install` 装的 app 不运行; 部署走 /system + reboot。
- **media 机制必须 priv-app**: `MEDIA_CONTENT_CONTROL` 是 `signature|privileged`, `/data/app` 安装拿不到 → "Missing permission to control media"。部署 = push 到 `/system/priv-app/bridge_executor/`(chmod 644 + chcon system_file) + reboot。白名单已有: `privapp-permissions-platform.xml`。`persist.adb.tcp.port=5555` 已设, 重启后无线 adb 不丢。
- **重启后 adbd 掉回 shell 权限**: 每次重启后先 `adb root` 再操作(否则写不了 app 目录); 车热点 IP 重启后会变, 用 `car_invoke.sh` 自动探测。
- **车 v1 execmd 契约(逆向自车上 APK, dex 存于 `D:\IM\bridge_test\reverse\imaudio-dex\`)**: envelope = `{command, params}`; params 按工具类型: scalar→`{"streamType":0}` 等 / dataclass→`{"sourceType":0}` / envelope→`{"body":{...},"headers":{"token":""},"options":{}}`。响应 = `{code:1000,message:"SUCCESS",command:<名>,data:...}`。
- **serve 用 wrapper 自愈**: `mcp-gateway\bridge-serve-wrapper.mjs` — 动态探测车热点 IP(仅私有网段) + adb connect + spawn serve, 每 15s 检查设备, 掉线自动重启。解决热点 IP 每次重连漂移导致 E2E 断的问题。config-cockpit.yaml 的 bridge server args 已指向 wrapper。
- **车控全量扩展素材**: `bridge_test\carcontrol_handlers.json`(57 handler→functionId 映射)、`carcontrol_tools_candidate.json`(57 候选 registry 工具)、`probe_carcontrol.sh`(批量验证脚本)、`mcp-gateway\bridge-analysis-carcontrol-candidates.json`(analysis 候选)。车恢复后跑 probe 脚本, 验证通过的自动进 registry。
- **UI 同步方案(待车验证)**: execmd 直接执行后端真实生效, 但 imaudio UI 不刷新 — 根因: UI 刷新依赖进程内监听器(effectModeUpdateListeners), execmd 在 :imaudio_service 进程触发, app 进程收不到。待验证: ① Settings_Global_SOUND_STAGE(注意拼写, 车 v1 用 Global 不是 Gloabal)的 ContentObserver 是否驱动音场页; ② UI 页面重开(onResume)是否重查后端; ③ 都不行则执行器 execmd 成功后补写持久化 key。
- **bridge_executor 用 vanilla 主题**(Theme.Translucent 会让 onCreate 不触发, 已知闪屏, 勿用回 translucent)。
- **serve 的 analysis 别手加 media caps**: serve 内置注册 `media_next/prev/play/pause`, analysis 里重复加会让 serve 崩(重复注册)。
- **Iron Law**: 每个 registry 里断言的字段都要能溯源到目标 app 源码位置, 禁止臆造 wire(用 mcp-analyze 走流程, 别手搓)。

---

## 7. 凭据/密钥

| 项 | 位置 |
|---|---|
| DashScope/Qwen key | `mcp-gateway\config-qwen.yaml`(及 `config-cockpit.yaml` 的 `${QWEN_API_KEY}`) |
| 车签名 keystore | `...\imaudio_app_compose-master\keystore\8797_platform.jks`(pw `<KEYSTORE_PASSWORD>`, alias `8797`) |
| adb 设备 | `b12bf58e`(USB); 或车热点下 `adb connect <车热点DNS IP>:5555` |

---

## 8. 接下来做什么

→ **[NEXT_STEPS.md](./NEXT_STEPS.md)**

---

## 9. 深入阅读

- `..\CONTEXT.md` — 术语(Capability / callTool / Form 1-2 / Substrate / D-step·J-step / Iron Law / bridge executor / mechanism / invoke / serve / devicePaths·vin)
- `..\docs\adr\0001-mcp-server-topology-host-side.md` — host-side topology 决策
- `..\docs\superpowers\plans\`, `..\specs\` — 计划与 spec
- `C:\Users\matca\.claude\projects\D--IM-bridge-test\memory\` — 持久记忆: `car-execution-constraints`, `bridge-android-substrate-plan-a`, `local-whisper-asr-setup`, `car-adb-hotspot-dns-ip`, `car-platform-blocks-sideloaded-apps`
