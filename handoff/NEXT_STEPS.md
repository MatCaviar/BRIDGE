# Next Steps — 0.1.23 推进路线

## 当前状态（一句话）

插件 0.1.23 已收敛为有效链路：**bridge-analyze（任意 app → 能力 schema，自带校验）→ analysis.json（唯一真相源）→ serve（MCP 投影）/ invoke（车端执行）**。四类直接执行机制（execmd/media/mapnav/carcontrol）+ App 型兜底（bridge-ui）全通并实测；E2E 38 工具面全绿；车控 57 候选待验证。旧 scaffold 流程已整体移除。

## 短期 — 车恢复后立即做（前置：adb 连上车，`tools/car_invoke.sh` 自动探测 IP）

1. **验证 wrapper 自愈**：断网重连车机热点 → gateway 的 bridge server 自动探测新 IP 并重启 serve（观察 gateway.log 的 `[bridge-serve-wrapper]` 行）。
2. **车控全量批量验证**：`bash tools/probe_carcontrol.sh` — 57 候选逐个 invoke，验证通过自动写回 registry；再把 `e2e/bridge-analysis-carcontrol-candidates.json` 中已验证的合并进 `bridge-analysis.json`（合并后跑 `node skills/bridge-analyze/validate-analysis.mjs` + `cli validate` 双校验）+ 重启 gateway。
3. **UI 同步验证**（execmd 直接执行后界面可见）：
   - ① execmd 切音场后查 `settings get global Settings_Global_SOUND_STAGE`（拼写：Global 不是 Gloabal）是否被写
   - ② imaudio 音场页切走再切回，UI 是否显示新状态（页面重开是否重查后端）
   - ③ 都不行 → 执行器 execmd 成功后补写持久化 key（需重建部署）
4. **部署最新执行器 + 生成 registry**：`node e2e/analysis-to-registry.mjs e2e/bridge-analysis.json <out>` → 推执行器 filesDir → 全量回归（音量/切歌/音场/任意地点导航/座椅加热·按摩/UI 驱动页面）。

## 中期 — 能力扩展（统一走 bridge-analyze 标准链）

5. **车控全量接入**：57 候选验证完成后，把剩余有价值功能（HUD/记忆/氛围灯/驾驶模式/ADAS 等）补 description 进 analysis（status 按验证结果）。
6. **更多 app onboarding**：任意新 app（电话/设置/天气等）→ `skills/bridge-analyze/` 自主分析 → analysis 能力块 → 双校验 PASS → 生成 registry → invoke 实测升级 status。
7. **App 型能力增强**：bridge-ui 补 ui_dump 分页/截断、多 display 支持（当前只驱动 display 0）。

## 长期 — 生产化

8. **安全**：gateway 信任 localhost，对外必须加鉴权；危险工具（车控写操作）加确认。
9. **可观测**：执行器每次 dispatch/result/error 落日志；serve 层加请求跟踪。
10. **降级**：ASR 已本地化；LLM 仍依赖云（DashScope），评估本地 fallback。
11. **多车适配**：当前契约全部逆向自这台开发车；换车用 bridge-analyze 重新分析验证。

## 工作流提示

- **标准链**：bridge-analyze（分析/校验）→ analysis.json → analysis-to-registry（registry）→ 部署 → invoke 实测 → status 升级。
- **双校验**：`node skills/bridge-analyze/validate-analysis.mjs <analysis>`（新规格）+ `cli validate <analysis>`（对齐后的 schema）。
- 手写 binder 的坑：`handoff/README.md` §6 + `bridge-executor/README.md`（事务码声明序、bind 隐性要求、typed-parcelable size 前缀、functionId 以服务端为准）。
- 凭据（DashScope key / keystore）不随仓库分发，找交接人。
