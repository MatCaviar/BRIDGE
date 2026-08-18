# Next Steps — 0.1.23

第一性原理：**让"语音 → 真实车机操作"闭环有效、可靠、通用**。当前唯一物理前置是车恢复在线（`tools/car_invoke.sh` 自动探测 IP）。以下按依赖顺序，每项一句话定位、一个关键动作。

## 1. 闭环验证（证明"有效"）— 车恢复后第一步

部署最新执行器（/system push + reboot）→ `node e2e/analysis-to-registry.mjs` 生成并部署 registry → 全量语音场景回归：音量 / 切歌 / 音场 / 任意地点导航 / 座椅加热·按摩 / UI 驱动页面。

## 2. 能力面补齐（证明"泛化"）

- 车控 57 候选批量验证（`tools/probe_carcontrol.sh`）→ 验证通过的合入 analysis（双校验后）
- 新 app onboarding 走 bridge-analyze 标准链（分析 → 校验 → registry → 实测升级 status）

## 3. UI 同步（证明"体验完整"）

直接执行（execmd）真实生效但 imaudio 界面不刷新——按序验证：`Settings_Global_SOUND_STAGE` 持久化是否驱动 UI → 页面重开是否重查后端 → 都不行则执行器 execmd 成功后补写持久化 key。

## 4. 生产化（证明"可交付"）

安全鉴权（gateway 对外）→ 执行器/serve 可观测 → LLM 本地降级评估 → 多车适配（换车用 bridge-analyze 重新分析验证）。


---

## 进展（2026-08-18，车 gen5_gvm @ 10.40.143.216:5555）

> 本机为 0.1.23 仓库工作副本。车热点 `AndroidAP_7446`，车 IP = WLAN 网关 `10.40.143.216`（车热点把 DNS 转发成 `119.29.29.29`，故 `tools/car_invoke.sh` 的“DNS=车 IP”探测在此失效，改用网关）。`Meta` TUN 代理会抢出站 adb，直连本地网关可绕过。

### 1 闭环验证 ✅
- **执行器**：车上 `/data/app` 覆盖层 `lastUpdateTime=2026-08-17 18:07`，已新且 imrpc 正常 -> 跳过重部署（仓库无签名 keystore / Android SDK / gradlew）。
- **analysis 校验**：`node skills/bridge-analyze/validate-analysis.mjs e2e/bridge-analysis.json` PASS（29 caps / 27 verified / 2 broken）。
- **registry 生成**：`node e2e/analysis-to-registry.mjs e2e/bridge-analysis.json bridge-executor/registries/registry.json` -> 27 tools（execmd 21 / mapnav 1 / carcontrol 5），全 verified。
- **registry 部署**：源码确认执行器运行时只读 `tools` + 顶层 `servicePackage/serviceClass`（回退）+ `intentScreens`（仅 intent），**不读** `app/framework/nativeCallTool/deviceSources/_doc` -> `{tools}` 覆盖安全。部署到 `filesDir/registry.json`，拉回 diff IDENTICAL。原车 registry 备份 `tmp/car-backup/registry.car.json`（29 tools）。
- **car_invoke 回归全绿**：A 组（只读+切歌）`get_sound_stage` / `get_last_volume_data` / `get_fast_audio_mode` / `query_current_active_sound` / `get_mic_vocal` / `query_sound_library` / `query_effect_library` / `media_next`；B 组（改态）`set_car_and_headrest_volume` / `set_sound_stage`(mode2->1 切回) / `nav_start`(同济大学，mapReady:true callbackOk:true)。

### 2 能力面补齐 🟡
- **车控批量验证**：全 **57/57 候选 probe-verified**。部署 probe-registry(27+候选) 后空-args invoke，判 `detail:"成功"` + `isExist:true`/`isValid:true`（actionType:6 路由校验响应，未实际改态）。事后对全座位加热/按摩/通风发 off 清理 + 恢复 27-tool。结果存 `tmp/car-backup/probe-full-results.json`。
- **合入 analysis**：**阻塞**。需逆向源码（`D:\IM\bridge_test\reverse\`，本机无）定 param schema + 人在车里功能级双校验（车控响应只回“成功”，无法自证执行生效）。

### 3 UI 同步 ✅（结论：执行器侧无需改）
- **execmd set_sound_stage 已写持久化 key** `Settings_Global_SOUND_STAGE`（`{"model":N}` 跟随 mode）-> NEXT_STEPS 兜底“执行器补写持久化 key”**不需要**（imaudio 在 setSoundStage 时已写）。
- **UI 不刷新**：经截图 + 像素比对 + 人眼确认，execmd 切 mode 后 imaudio 选项高亮不移动（s1/s2/s3 左区 0 变化），冷重开也不重查（仍显示旧 mode 高亮）；右区变化是光波动效（装饰动画），非 mode 驱动。
- **真正问题在 imaudio app 侧**（不监听 setting / 冷重开不重查 getSoundStage），**超出 bridge/executor 范围**，需 imaudio 同事处理。

### 4 生产化 ⬜ 未开始
安全鉴权 / 执行器·serve 可观测 / LLM 本地降级评估 / 多车适配。

### 产出物
- 部署：车上 `files/registry.json`（27 tools）= `bridge-executor/registries/registry.json`
- 备份：`tmp/car-backup/registry.car.json`（原 29-tool）
- probe：`tmp/car-backup/probe-full-results.json` / `probe-driver-results.json`
- Step3 截图：`tmp/car-backup/shot1/2/3*.png`、`opt_*.png`、`right_*.png`

### 遗留/阻塞
- Step2 合入：需逆向源码 + 人在车双校验。
- Step2 onboarding：需目标 app 源码。
- 车端自动化已做尽；余下 Step4 为车无关设计与实现。
