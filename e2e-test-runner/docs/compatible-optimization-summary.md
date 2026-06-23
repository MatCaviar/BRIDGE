# MCP 工具优化 - 兼容式方案总结

## 优化成果

| 方案 | Tokens | 减少 | MCP Server 兼容 |
|------|--------|------|-----------------|
| **原始** | 2511 | - | ✅ 完全兼容 |
| **兼容优化** | 669 | 73% | ✅ 完全兼容 |
| **语义化** | 151 | 94% | ❌ 需要重构 |

## 推荐方案：兼容式优化 (669 tokens)

### 优势

1. **完全兼容现有 MCP Server** - 无需修改任何服务器代码
2. **显著减少 tokens** - 从 2511 → 669（减少 73%）
3. **保持工具名不变** - LLM 调用成功率不受影响
4. **实施成本低** - 仅需修改 prompt 生成逻辑

### 优化策略

#### 1. 压缩工具描述
```diff
- Description: Read equalizer status and return current effect configuration
+ equalizer_read(): 读取equalizer
```

#### 2. 简化参数表示
```diff
- Input JSON schema: {"type": "object", "properties": {"preset": {"type": "string", "enum": ["0", "1", "2", "3"]}}, "required": ["preset"]}
+ equalizer_preset_set(preset=[0|1|2|3]): 设置equalizer preset
```

#### 3. 移除冗余内容
- 删除重复的枚举完整列表
- 保留必要的枚举提示
- 压缩使用说明

### 预期性能改善

| 指标 | 当前 | 优化后 | 改善 |
|------|------|--------|------|
| **首轮输入 tokens** | 5366 | ~3500 | **-35%** |
| **二轮输入 tokens** | 8200 | ~6300 | **-23%** |
| **首轮延迟** | 6.6s | ~5s | **-25%** |
| **二轮延迟** | 8.3s | ~6s | **-28%** |

### System Prompt 示例

```
2026-06-12

MCP tools via XML format: <use_mcp_tool><server_name/><tool_name/><arguments>{}</arguments></use_mcp_tool>

## imaudio
- equalizer_read(): 读取equalizer
- equalizer_preset_set(preset=[0|1|2|3]): 设置equalizer preset
- equalizer_custom_set(effectId,values): 设置custom equalizer
- soundstage_set(mode,fade,balance): 设置sound stage
- karaoke_mode_set(mode=[0|1|2]): 设置karaoke mode

## aipet
- navigate_to(pageName=[home|photo|phone]): 导航到页面
- pet_status_set(state): 设置宠物状态

Usage: one tool per response, results in next turn.
```

### 实施步骤

1. ✅ 创建兼容式 prompt 生成器
2. ⏳ 集成到 interactive.py
3. ⏳ 测试验证工具调用成功率
4. ⏳ 性能基准测试

### 验收标准

- [x] System prompt < 800 tokens
- [x] 保持现有工具名
- [x] MCP server 无需修改
- [ ] 工具调用成功率 > 95%
- [ ] 延迟改善 > 20%

### 后续优化方向

如果需要进一步优化（目标 150 tokens），可以考虑：

1. **渐进式重构 MCP Server**
   - 逐步添加语义化工具作为新接口
   - 保持旧工具作为 fallback
   - A/B 测试验证准确性

2. **混合模式**
   - 常用工具保持原样
   - 复杂工具使用语义化接口

3. **动态 Prompt**
   - 根据对话内容动态加载相关工具
   - 减少不必要的工具定义

## 结论

兼容式优化在保持完全兼容性的同时，实现了 73% 的 token 减少，是当前最佳的优化方案。
