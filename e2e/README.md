# E2E 端到端测试 — 怎么跑

语音 → 车 的完整闭环。两个 MCP server 由 gateway 自动拉起。

## 组件

| 文件 | 作用 |
|---|---|
| `bridge-analysis.json` | **唯一真相源**: serve 字段(id/description/params/status) + 车端机制字段(mechanism/methodName/ccFunction/bindAction…) |
| `config-cockpit.yaml` | gateway 配置: LLM(DashScope qwen3.5-flash) + 两个 stdio MCP server |
| `bridge-serve-wrapper.mjs` | serve 透明代理: 动态探测车热点 IP(仅私有网段) + adb connect + 每 15s 断线自愈重启 |
| `bridge-ui-server.mjs` | App 型能力 MCP server: ui_launch/ui_dump/ui_tap_text/ui_tap/ui_swipe/ui_back/ui_home/geo_search |
| `analysis-to-registry.mjs` | analysis.json → 车端 registry.json 生成器(消除双份手写) |
| `src/` | mcp-gateway 源码(LLM 编排 + dashboard + SSE) |
| `dashboard/cockpit.html` | 语音界面(点🎤说话) |

## 启动

```bash
# 1) 车机连接(车热点下, 本机 WLAN 的 DNS = 车机 IP; wrapper 会自动探测)
adb connect <车机IP>:5555
adb root   # 重启后 adbd 掉回 shell, 需重新 root

# 2) 本地 ASR(先起, 模型已缓存 ~15s 就绪)
python ../asr/asr-whisper-server.py

# 3) gateway(需 QWEN_API_KEY 环境变量)
export QWEN_API_KEY=<your-key>
npm install
npm run dashboard -- --config config-cockpit.yaml
#   看到 "Ready — 38 tools available" 即就绪

# 4) 浏览器 http://localhost:3000/cockpit
```

## 工具面(38 = bridge 30 + bridge-ui 8)

- bridge(serve): imaudio 21(execmd) + media 4(内置) + nav_start 1(mapnav) + 车控 5(carcontrol) + 2 broken 自动跳过
- bridge-ui: ui_launch/ui_dump/ui_tap_text/ui_tap/ui_swipe/ui_back/ui_home/geo_search(联网地理编码)

## 无 GUI 测试(文本指令)

```bash
curl -X POST http://localhost:3000/api/run -H "Content-Type: application/json" \
  -d '{"message":"导航到上海虹桥机场"}'
# 返回 sessionId; 事件流: GET /api/events/<sessionId>(SSE)
```

## 维护要点

- **改工具**: 只改 `bridge-analysis.json`(唯一真相源) → `node analysis-to-registry.mjs bridge-analysis.json <out>` 生成车端 registry → 部署 registry 到执行器 filesDir。
- **校验规格**: `node ../skill/bridge-analyze/validate-analysis.mjs bridge-analysis.json`。
- **热点 IP 漂移**: wrapper 自动处理(启动探测 + 掉线重启); 观察 gateway.log 的 `[bridge-serve-wrapper]` 行。
- **ADB 编码坑**: Windows 下 `adb shell` 输出中文会被转码, 用 `adb exec-out`(bridge-ui 已处理)。
- **uiautomator dump**: app 刚启动时可能失败, bridge-ui 已做 4 次重试。

## 已验证矩阵(2026-08-17 全绿)

音量调到18 / 切到下一首 / 把音场调到沉浸影院 / 打开imaudio把音场切到专业听音室 / 打开imaudio的无麦K歌页面(纯 UI 驱动) / 导航到上海虹桥机场(geo_search→nav_start) / 打开主驾座椅加热·按摩。
