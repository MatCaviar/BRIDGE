# 接下来做什么 (Next Steps)

## 目标(一句话)

把**车机上所有开放可调用的能力**都封装进**一个** bridge_executor(车端 app), 并在**本地端到端**验证: 语音智能体 → (host serve) → 车端 bridge app → 真实车机操作 → 回显。

---

## 现状基线 (2026-08-17 更新)

- 已封装并**车上真验证**: **imaudio 23 个 AIDL 能力**(execmd 机制, none/scalar/envelope/dataclass 全模式真数据) + **媒体切歌 4 个**(media 机制, 控制 QQ 音乐) + **导航 1 个**(`nav_start`, BanmaMap navigateToForAI) + **车控 5 个**(`cc_*`, CarControlService 座椅加热/通风/按摩/热石/加热档位)。
- **E2E 语音闭环已跑通**: ASR→LLM→serve(30 工具)+bridge-ui(8 工具: ui_launch/ui_dump/ui_tap_text/ui_tap/ui_swipe/ui_back/ui_home/geo_search)→invoke→车。实测全绿: 音量/切歌/音场/导航(同济大学·虹桥机场, 含 geo_search 联网解析坐标)/座椅加热/按摩/UI 驱动页面(无麦K歌页·关弹窗·选音源)。
- **App 型能力**: bridge-ui server 按文本驱动任何 app 界面 (uiautomator dump + input tap), LLM 像人一样"看界面→点按钮"。
- 已修复: ① AIDL 事务码顺序; ② execmd 参数键 `params`; ③ 地图 bind 需 packageName extra; ④ 本 ROM 显式 bind 也要求 action 匹配 filter (registry 加 bindAction); ⑤ uiautomator dump 需重试(启动期 idle 未就绪); ⑥ Windows adb 管道中文乱码 → exec-out。
- 缺口: 车控仅 5 个高价值工具 (全量 500+ functionId 已枚举在 `reverse/byod-dex`, 可批量扩展); 空调域本车无 handler。

下面 4 个 Phase, 前两个无车可做, 后两个需车。

---

## Phase 1 — 把 bridge_executor 做成"多 app 通用执行器"(无车可做, **优先**)

> 为什么先做: "所有能力封进一个 bridge app" 要求执行器一次服务**多个**目标 app。当前 registry 的 `servicePackage/serviceClass` 是**顶层**的(单 app)。

**任务:**
1. **registry schema 下沉**: 让每个 tool(或 tool-group)自带 `servicePackage`/`serviceClass`(可选, 缺省回退顶层)。`ExecutorActivity.lookupTool` 按 tool 解析目标 `ComponentName`。
2. **mechanism 扩展**: 现有 `aidl`/`media`。按需加:
   - `intent`(Form 1 startActivity) ✅ **已做** — 执行器内 `dispatchIntent` + 多屏选屏(`intentScreens`/`resolveDisplayId`); `carcontrol-registry.json` 为样例
   - `carproperty`(Android Car `CarPropertyManager`, 车控/空调) — 仍待
   - `calltool`(平台标准 callTool AIDL, 若目标 app 已实现 → 最省事) — 仍待
   - `carproperty`(Android Car `CarPropertyManager`, 车控/空调)
   - `calltool`(平台标准 callTool AIDL, 若目标 app 已实现 → 最省事)
3. **serve 聚合多 analysis**: `serve --analysis imaudio.json --analysis nav.json ...` 暴露统一工具面(或先合并成一个 analysis)。

**验证:** 一个执行器 + 两份 registry(imaudio + 一个 stub/mock service) → `invoke` 两边都 `ok=true`。

**预估:** 1–2 天。改 registry schema + ExecutorActivity 分派 + serve 多 analysis; 不碰目标 app。

---

## Phase 2 — 盘点并 onboard 更多车机能力(需车, **核心增量**)

> 车机"开放可调用面"候选, 逐个判定 substrate / Form 1|2 / 权限:

| 候选能力域 | substrate / 形式 | 备注 |
|---|---|---|
| 导航 BanmaMap (`MapExternalService`) | AIDL, Form 2 | **已定位**, 反向 AIDL 即可加 |
| 媒体(已在) | media, Form 2 | 补: 播放列表/收藏/搜索? 看媒体 app 暴露面 |
| 空调/座椅/灯光 (CarControl) | intent 页面跳转**已可**; Form 2 底层控制待 | 页面跳转已有 `carcontrol-registry.json`(7 工具); 设温度/按摩档位等带状态控制仍要找 Form 2 服务或 CarProperty |
| 车控 (HVAC, 车窗) | `CarPropertyManager`, Form 2 | 需 system 权限, 平台 Car service |
| 电话/通讯录 | intent/AIDL | Form 1 居多 |
| 设置 / 语音助手 intents | intent, Form 1 | host 可直发 |

**方法(在车上):**
- `service list` / `dumpsys -l` / `pm dump <pkg>` 找暴露的 service 与 AIDL。
- 反编译目标 app(jadx)抽 AIDL + adapter, 走 **mcp-analyze** 流程 → analysis → registry。
- 优先用平台标准 **callTool**(若 app 已实现): 直接调, 免反向。

**每个 app 产出:** `analysis.json` + `registry.json`, 灌进 serve 与执行器。

**验证:** 每个新能力 `invoke --op <id> --device <serial>` 一次, `result.json` `ok=true` 且数据真实。

---

## Phase 3 — 本地端到端测试矩阵(需车, **收口**)

车就绪后(adb: `b12bf58e` USB, 或车热点 `adb connect <DNS>:5555`):

1. 部署 Phase 1 版 `bridge_executor` 到 `/system/priv-app/` + reboot。
2. 部署**合并后**的 registry(所有 app 的工具)到执行器 `filesDir/registry.json`。
3. 跑 **e2e 矩阵**(每个能力家族一条语音指令):

| 语音指令 | 期望工具 | 期望车端效果 | pass |
|---|---|---|---|
| 切到下一首 | `media_next` | 播放器跳曲 | ☐ |
| 音量调到 15 | `set_car_and_headrest_volume(15,0)` | 车机音量变 | ☐ |
| 打开导航去公司 | `nav_start(公司)` | 导航起算路线 | ☐ |
| 温度调到 22 | `hvac_set_temp(22)` | 空调温度变 | ☐ |
| …(每域至少 1 条) | | | ☐ |

4. **完整闭环 demo**: 🎤 → ASR → LLM → serve → invoke → 执行器 → 车 → result → SSE → cockpit 显示 + TTS 确认。

**验证:** 全表 ☐ 变 ✅, 且 cockpit 端状态/颜色/语音回读正确。

---

## Phase 4 — 生产化 / 硬化(收尾)

- serve 接 **createSafetyGuard**: 危险工具先校验前置条件, fail-closed。
- `bridge-analysis.json` 改用 **mcp-analyze 正式生成**(目前部分手写)。
- 执行器**主题闪屏**修复(换正经主题, 非 Theme.Translucent)。
- **可观测**: 每次 dispatch/result/error 落日志(便于排障)。
- **安全**: gateway 目前信任 localhost; 对外用必须加鉴权。
- **降级**: ASR 已本地; LLM 仍依赖云(DashScope), 评估是否要本地 fallback。

---

## 工具规格 (bridge-analyze, 2026-08-17 重构)

- **唯一真相源**: `mcp-gateway/bridge-analysis.json` 同时携带 serve 字段(id/description/params/status) + 车端机制字段(mechanism/methodName/pattern/ccFunction/bindAction...)。车端 `registry.json` 由 `node mcp-gateway/analysis-to-registry.mjs bridge-analysis.json <out>` 生成 — 不再双份手写。
- **skill**: `~/.claude/skills/bridge-analyze/SKILL.md` — 任意 app(源码/PRD/APK/观察) → analysis.json 的分析规范(description 触发场景模板/enum wire 值/status 三态/机制选择/血泪坑)。
- **验证**: 生成器输出与历史 registry 字段级一致; serve 工具面 = 27 active + 4 media = 31。

## 立即解锁项(优先级最高, 大部分需车)

1. **车控全量批量验证**: 车连上后跑 `bash D:/IM/bridge_test/probe_carcontrol.sh` — 57 个候选工具逐个 probe, 验证通过的自动写回 registry; 再把 `bridge-analysis-carcontrol-candidates.json` 里已验证的合并进 `bridge-analysis.json` + 重启 gateway。
2. **UI 同步验证**: 按 README 的 UI 同步方案三步验证 — execmd 切换音场后 ① 查 `settings get global Settings_Global_SOUND_STAGE`; ② imaudio 音场页切走再切回看 UI 是否显示新状态; ③ 若不行, 执行器 execmd 成功后补写持久化 key (代码改动需重建部署)。
3. **热点重连后验证 wrapper 自愈**: 断网重连车机热点, gateway 的 bridge server 应自动探测新 IP 并重启 serve (看 gateway.log 的 `[bridge-serve-wrapper]` 行)。
4. **全量回归**: 车恢复后跑 E2E 矩阵 (音量/切歌/音场/导航任意地点/座椅加热/UI 驱动), 确认全绿。

---

## 工作流提示

- 改动走 **BRIDGE pipeline**(analyze→scaffold→generate→gates→build→serve), 勿手搓 registry wire(**Iron Law**: 每个字段溯源源码)。
- **host 侧**(mcp-gateway / cockpit / ASR)改动独立于车; **车端**(bridge_executor)改动走 /system + reboot。
- 相关持久记忆: `bridge-android-substrate-plan-a`、`car-execution-constraints`、`local-whisper-asr-setup`、`car-adb-hotspot-dns-ip`、`car-platform-blocks-sideloaded-apps`(`C:\Users\matca\.claude\projects\D--IM-bridge-test\memory\`)。
