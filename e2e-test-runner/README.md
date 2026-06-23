# E2E Test Runner for MCP Servers

基于真实 LLM 调用的 MCP 服务器端到端测试框架。

## 功能特性

- ✅ 真实 LLM 集成 (支持 Qwen/DashScope、OpenAI)
- ✅ MCP stdio 通信协议
- ✅ 多服务器支持 (imaudio, aipet, hvac)
- ✅ ReAct 循环 (最多 3 次重试)
- ✅ MCP XML 格式工具调用
- ✅ 交互式 REPL
- ✅ YAML 配置 (兼容 Z-AXIS 格式)

## 快速开始

### 1. 安装依赖

```bash
cd e2e-test-runner
pip install -r requirements.txt
```

### 2. 选择模型并配置

**默认模型**: qwen3.6-flash

**可用模型**:
- `qwen3.6-flash` (默认) - 快速响应
- `qwen3.6-plus` - 更强能力
- `qwen3.7-max` - 最强能力
- `qwen3.7-plus` - 平衡性能
- `qwen3.5-flash` - 上一代快速版
- `qwen3.5-plus` - 上一代增强版

**切换模型** (方法一 - 环境变量):
```bash
set QWEN_MODEL=qwen3.7-max
run-e2e.bat
```

**切换模型** (方法二 - 修改 config.yaml):
```yaml
model_profile: qwen3.7-max
```

### 3. 配置 API Key

```bash
# 设置 Qwen API Key (可选，config.yaml 中有默认值)
set QWEN_API_KEY=your-api-key
```

### 4. 运行测试

从项目根目录运行：

```cmd
# 快速验证测试
run-tests.bat

# 交互式测试
run-e2e.bat
```

或在 e2e-test-runner 目录中：

```bash
# 测试初始化
python test_init.py

# 测试完整 E2E 流程
python test_e2e.py

# 交互式测试 (需要在终端中运行)
python interactive.py
```

## 配置说明

### config.yaml

主配置文件，兼容 Z-AXIS 的 LLM 配置格式：

```yaml
# 选择模型 (可通过环境变量 QWEN_MODEL 覆盖)
model_profile: ${QWEN_MODEL:qwen3.6-flash}

# 模型配置档案
model_profiles:
  qwen3.6-flash:
    provider: "openai"
    model_name: "qwen3.6-flash"
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    api_key: ${QWEN_API_KEY:sk-xxx}
    async_client: true
    temperature: 0.7
    top_p: 0.95
    max_tokens: 64000
    max_context_length: 262144

  # ... 其他模型档案

# Agent 配置
agent:
  keep_tool_result: -1

# MCP 服务器配置
servers:
  - name: "imaudio"
    path: "../mcp-imaudio"
    command: "node"
    args: ["dist/index.js"]
    analysis_json: "../schema/__tests__/fixtures/imaudio-analysis.json"
```

### 环境变量替换

支持 `${VAR_NAME:default_value}` 语法：

```yaml
api_key: ${QWEN_API_KEY:default-key-here}
```

## 项目结构

```
e2e-test-runner/
├── config.yaml           # 主配置文件 (YAML)
├── requirements.txt      # Python 依赖
├── gateway.py            # MCP JSON-RPC 网关
├── servers.py            # MCP 服务器管理器
├── prompt_generator.py   # LLM 系统提示生成
├── config_loader.py      # YAML 配置加载器
├── llm/                  # LLM 客户端 (来自 Z-AXIS)
│   ├── factory.py        # LLM 客户端工厂
│   ├── base_client.py    # 基础客户端
│   ├── providers/        # OpenAI/Anthropic 实现
│   └── util.py           # 工具装饰器
├── utils/                # 工具解析
│   └── parsing_utils.py  # MCP XML 解析
├── interactive.py        # 交互式测试入口
├── test_init.py          # 初始化测试
└── test_e2e.py           # E2E 流程测试
```

## 交互式测试示例

```cmd
请输入语音指令 (或 'quit' 退出): 帮我检查音频系统的健康状态

收到指令: 帮我检查音频系统的健康状态
--- Attempt 1/3 ---
Executing tool: imaudio.health_check with args: {}
Tool results sent to LLM
No tool calls - returning final answer

============================================================
AI 响应:
============================================================
音频系统健康检查完成，系统运行正常。
============================================================
```

## LLM 工具调用格式

LLM 需要返回以下 MCP XML 格式：

```xml
<use_mcp_tool>
<server_name>imaudio</server_name>
<tool_name>health_check</tool_name>
<arguments>
{
  "param1": "value1",
  "param2": "value2"
}
</arguments>
</use_mcp_tool>
```

## 可用的 MCP 服务器

### imaudio
- `health_check` - 健康检查
- `soundstage_read/set` - 声场设置
- `equalizer_read/preset_set/custom_set` - 均衡器
- `beosonic_read/preset_set` - Beosonic

### aipet
- 各种宠物相关功能

### hvac
- 空调控制功能

## 错误处理

- 工具调用失败时，错误信息会返回给 LLM
- 最多重试 3 次 (可配置)
- 超过重试次数后返回失败消息

## 技术栈

- **Python 3.12+**
- **asyncio** - 异步 I/O
- **PyYAML** - 配置文件解析
- **MCP SDK** - Model Context Protocol
- **Z-AXIS LLM Client** - OpenAI 兼容 API 调用

## 开发参考

- Z-AXIS 配置格式: `D:\ZZT\Z-AXIS_v3.0\apps\zaxis-agent\conf\llm\qwen3.5-flash.yaml`
- MCP 协议: https://modelcontextprotocol.io

## 从旧版本迁移

### servers.json → config.yaml

旧的 `servers.json` 内容已迁移到 `config.yaml` 的 `servers` 部分：

```yaml
servers:
  - name: "imaudio"
    path: "../mcp-imaudio"
    ...
```

### Python 代码更新

- 使用 `from config_loader import load_config, SimpleConfig`
- 调用 `load_config()` 加载 YAML 配置
- 传递配置字典给 `ServerManager()` 和 `generate_system_prompt_from_servers()`
