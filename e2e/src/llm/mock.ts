import type { LLMClient, LLMResponse, Message } from "./types.js";

interface OpenAIToolLike {
  readonly type?: string;
  readonly function?: {
    readonly name?: string;
    readonly description?: string;
    readonly parameters?: Record<string, unknown>;
  };
}

/** Offline upstream-Agent probe used only by the deterministic E2E schema smoke test. */
export class MockSchemaClient implements LLMClient {
  async createMessage(params: { systemPrompt: string; messages: Message[]; tools: unknown[] }): Promise<LLMResponse> {
    const tools = params.tools as OpenAIToolLike[];
    const example = tools.find((tool) => {
      const name = tool.function?.name ?? "";
      return !name.includes("media_") && Object.keys((tool.function?.parameters?.properties as object | undefined) ?? {}).length > 0;
    }) ?? tools[0];
    const fn = example?.function;
    const properties = (fn?.parameters?.properties ?? {}) as Record<string, { type?: string; enum?: unknown[]; items?: { type?: string; enum?: unknown[] } }>;
    const signature = Object.entries(properties).map(([name, schema]) => {
      const itemType = schema.type === "array" ? `List[${schema.items?.type ?? "any"}]` : (schema.type ?? "any");
      const options = schema.enum ?? schema.items?.enum;
      return `${name}: ${itemType}${options?.length ? ` {${options.join("/")}}` : ""}`;
    }).join(", ");
    const text = `E2E PASS：上游 Agent 已接收 ${tools.length} 个 function schema。` +
      (fn ? `示例 ${fn.name}(${signature || "无参数"})；description、参数类型与 options 均来自 MCP tools/list。` : "");
    return {
      text,
      toolCalls: [],
      stopReason: "end_turn",
      usage: { inputTokens: JSON.stringify(params.tools).length, outputTokens: text.length },
    };
  }
}
