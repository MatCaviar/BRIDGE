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
