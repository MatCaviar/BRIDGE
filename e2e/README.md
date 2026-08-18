# E2E 端到端测试 — 语音 → 车

两个 stdio MCP server 由 mcp-gateway 自动拉起: `bridge`(serve, 见 cli) + `bridge-ui`(App 型能力)。
- `bridge-analysis.json`: 唯一真相源(serve 字段 + 车端机制字段)
- `bridge-serve-wrapper.mjs`: serve 透明代理, 动态探测车热点 IP + 断线自愈
- `bridge-ui-server.mjs`: ui_launch/ui_dump/ui_tap_text/.../geo_search
- `analysis-to-registry.mjs`: analysis → 车端 registry 生成器
- 启动: 见仓库根 README 新增节 + handoff/README.md
