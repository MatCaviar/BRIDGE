# MCP 工具优化方案

**日期**: 2025-06-12
**状态**: ✅ 已完成设计

## 优化目标

将 System Prompt 从 **2511 tokens** 减少到 **~300 tokens**，同时保持功能完整性。

## 优化策略

### 1. 语义工具合并

**原始方案**：46个独立工具
```
equalizer_read
equalizer_preset_set
equalizer_custom_set
equalizer_custom_save
soundstage_read
soundstage_set
...
```

**优化方案**：15个语义工具
```
equalizer_manage(action: read|set_preset|set_custom|save)
soundstage_manage(action: read|set)
vnc_manage(action: read|set)
beosonic_manage(action: read|set)
locksound_manage(action: read|enable|disable)
karaoke_manage(action: read|set)
navigation_manage(action: navigate)
pet_status_manage(action: read|set)
temperature_manage(action: read|set)
fan_manage(action: read|set)
...
```

### 2. Schema 简化

**原始**：
```json
{
  "type": "object",
  "properties": {
    "preset": {
      "type": "string",
      "enum": ["0", "1", "2", "3"]
    }
  },
  "required": ["preset"]
}
```

**优化**：
```
equalizer_manage(set_preset, {"mode": "摇滚"})
```

### 3. 结构压缩

移除：
- 冗长的 JSON schema 定义
- 重复的枚举列表
- 过度详细的描述

保留：
- 核心工具名称和操作
- 必要的语义说明

## 优化效果

| 方案 | Tokens | 工具数 | 减少比例 |
|------|--------|--------|----------|
| **原始** | 2511 | 46 | - |
| **语义化** | 307 | 15 | **-88%** |
| **超紧凑** | 111 | 15 | **-96%** |

## 实施方案

### 推荐方案：语义化优化 (307 tokens)

**优势**：
- 保持可读性和可维护性
- LLM 易于理解语义
- 便于扩展新功能

**System Prompt 结构**：
```
Date: 2026-06-12

You are an intelligent assistant with access to vehicle systems via MCP.

## Audio Management
- equalizer_manage(read|set_preset|set_custom|save) - 均衡器管理
- soundstage_manage(read|set) - 声场管理
- beosonic_manage(read|set) - Beosonic音效

## System Controls
- vnc_manage(read|set) - VNC控制
- locksound_manage(read|enable|disable) - 锁屏音效
- karaoke_manage(read|set) - 卡拉OK模式

## Usage Examples
User: "调一个劲爆的均衡器"
→ equalizer_manage(action="set_preset", params={"mode": "摇滚"})
```

### 超紧凑方案 (111 tokens)

**适用场景**：
- Token 预算极度受限
- LLM 理解能力强
- 工具操作相对固定

**System Prompt**：
```
2026-06-12
MCP tools: <server><tool><params/></server>

imaudio: equalizer_manage(read|set_preset|set_custom|save) soundstage_manage(read|set)
aipet: navigation_manage(navigate) pet_status_manage(read|set)
hvac: temperature_manage(read|set) fan_manage(read|set)
```

## MCP Server 端适配

### 参数路由

在 MCP server 端实现 action 到具体操作的映射：

```python
def equalizer_manage(action, params):
    if action == "read":
        return EqualizerModel.getEffectValues()
    elif action == "set_preset":
        mode = params.get("mode")
        preset_id = MUSIC_MODE_MAP.get(mode, params.get("preset"))
        return EqualizerModel.sendEffectValues(preset_id)
    elif action == "set_custom":
        return EqualizerModel.sendCustomEffectValues(
            params.get("effectId"),
            params.get("values")
        )
    elif action == "save":
        return EqualizerModel.createAndSaveEffect(
            params.get("name"),
            params.get("values")
        )

MUSIC_MODE_MAP = {
    "摇滚": "3",
    "流行": "1", 
    "古典": "2",
    "人声": "0"
}
```

## 性能改进预估

| 指标 | 当前 | 优化后 | 改善 |
|------|------|--------|------|
| **首轮输入 tokens** | 5366 | ~3200 | **-40%** |
| **二轮输入 tokens** | 8200 | ~6000 | **-27%** |
| **首轮延迟** | 6.6s | ~4s | **-40%** |
| **二轮延迟** | 8.3s | ~5s | **-40%** |

## 验收标准

- [ ] System prompt tokens < 400
- [ ] 工具数量 < 20
- [ ] LLM 正确理解语义工具
- [ ] 实际工具调用成功率 > 95%
- [ ] 延迟改善 > 30%

## 实施步骤

1. ✅ 设计语义工具合并方案
2. ⏳ 更新 prompt_generator.py
3. ⏳ 实现 MCP server 端 action 路由
4. ⏳ 集成测试验证功能
5. ⏳ 性能对比测试

## 风险与缓解

### 风险 1：LLM 语义理解不足
**缓解**：
- 提供清晰的 usage examples
- 在工具名称中保留操作关键词
- 逐步迁移，保留原工具作为 fallback

### 风险 2：参数映射复杂度
**缓解**：
- 在 MCP server 端统一处理
- 提供常用语义别名映射
- 详细的错误提示

### 风险 3：现有功能回归
**缓解**：
- 保留原工具定义作为 reference
- A/B 测试对比准确率
- 渐进式迁移策略
