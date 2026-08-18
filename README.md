# BRIDGE / imaudio MCP 化 — 座舱智能体

把**车机 app 的对外能力**确定性地变成**上游 LLM agent 可调用的 MCP 工具集**：本地 PC 用语音智能体驱动真实车机（不是 mock）。

```
🎤 语音 → cockpit.html → mcp-gateway(LLM + MCP 编排)
                                   ↓ stdio
        bridge serve(MCP server, host PC) ← bridge-serve-wrapper(动态IP+自愈)
                                   ↓ invoke(D-step, adb)
             车端 bridge_executor (com.immotors.bridge.executor, system priv-app)
                                   ↓ bind 显式组件 + 反射 / MediaController / CustomService / 地图AI接口
                         目标 app (imaudio / QQ音乐 / BanmaMap / CarControlService)
                                   ↓
                              真实车机操作 → result.json → 回显 + TTS
```

## 核心设计

- **目标 app 零改动**：执行器 bind 目标 app 现有的 AIDL service，所有 per-app 知识（AIDL 契约 + registry）都在 bridge 侧。
- **四类直接执行机制**（binder 直调，不碰屏幕）：
  | 机制 | 覆盖 |
  |---|---|
  | execmd | imaudio 23 能力（executeCommand 单入口） |
  | media | 媒体会话控制（QQ音乐 切歌/播放/暂停） |
  | mapnav | 车机地图导航（任意地点，联网 geocode 坐标） |
  | carcontrol | CarControlService（座椅加热/通风/按摩/热石等） |
- **App 型兜底**：bridge-ui（ui_launch/ui_dump/ui_tap_text…）——按文本驱动任意 app 界面。
- **唯一真相源**：`e2e/bridge-analysis.json`（serve 字段 + 车端机制字段）→ `analysis-to-registry.mjs` 生成车端 registry，不双份手写。
- **skill**：`skill/bridge-analyze/` — host codeagent 自主分析任意应用 → 能力 schema（自包含 + 自带校验器）。

## 组件

| 组件 | 位置 | 状态 |
|---|---|---|
| bridge-analyze skill | `skill/bridge-analyze/` | ✅ 重构完成, 校验器 PASS |
| E2E 主入口 (mcp-gateway) | `e2e/` | ✅ 跑通, 38 工具面 |
| 车端执行器源码 | `bridge-executor/` | ✅ 代码完, 待部署验证 |
| 工具脚本 | `tools/` (car_invoke.sh / probe_carcontrol.sh) | ✅ |
| 本地 ASR | `asr/asr-whisper-server.py` (faster-whisper, 端口 8765) | ✅ |
| 逆向素材说明 | `reverse/README.md` (dex 太大不入库) | ✅ |

## 快速开始

```bash
# 1) 本地 ASR(先起)
python asr/asr-whisper-server.py    # 依赖本地 venv + HF 镜像, 见 asr/README

# 2) mcp-gateway + cockpit(两个 MCP server 自动拉起: bridge + bridge-ui)
cd e2e && npm install && npm run dashboard -- --config config-cockpit.yaml
#    需 QWEN_API_KEY 环境变量(凭据见 handoff/README.md)

# 3) 浏览器 http://localhost:3000/cockpit → 点 🎤 说话
```

实测通过的语音场景：音量调节 / 切歌 / 音场切换 / 任意地点导航 / 座椅加热·按摩 / UI 驱动页面操作（详见 `handoff/README.md` 验证矩阵）。

## 交接

- 移交说明: `handoff/README.md`
- 下一步: `handoff/NEXT_STEPS.md`
- 术语与设计: `handoff/README.md` §9
