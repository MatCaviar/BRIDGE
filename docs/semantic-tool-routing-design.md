# MCP Server 语义化工具路由设计

## 问题

当前 System Prompt 使用语义化工具（如 `navigation_manage`），但 MCP Server 注册的是细粒度工具（如 `navigate_to`），导致工具调用失败。

## 解决方案

在 MCP Server 端注册语义化工具，根据 `action` 参数路由到具体操作。

## 实现模式

```typescript
// 语义化工具注册
server.registerTool(
  "navigation_manage",
  {
    description: "页面导航管理",
    inputSchema: {
      action: z.enum(["navigate", "go_back", "go_forward"]),
      params: z.record(z.string(), z.any()).optional()
    }
  },
  async (input) => {
    const { action, params } = input;

    // 路由到具体操作
    switch (action) {
      case "navigate":
        return await adapter.navigateToPage(params.pageName);
      case "go_back":
        return await adapter.goPageBack();
      case "go_forward":
        return await adapter.goPageForward();
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }
);
```

## 实施步骤

1. 修改 MCP Server 工具注册逻辑
2. 实现 action 路由器
3. 保持原有细粒度工具作为 fallback
4. 测试语义化工具调用

## 预期收益

- System Prompt tokens 减少 94%
- 工具数量减少 83%
- LLM 调用成功率提升
