export interface LLMConfig {
  readonly provider: string; // "anthropic" | "openai" | "qwen" | "glm" | "deepseek" | "mock"(E2E smoke only)
  readonly model: string;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly temperature?: number;
  readonly maxTokens?: number;
}

export interface Message {
  role: "user" | "assistant" | "tool_result";
  content: string;
  toolCallId?: string; // for tool_result messages
  toolCalls?: ToolCall[]; // for assistant messages (to preserve tool calls in history)
}

export interface ToolCall {
  id: string;
  serverName: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: "end_turn" | "tool_use" | "max_tokens";
  usage: { inputTokens: number; outputTokens: number };
}

export interface LLMClient {
  createMessage(params: {
    systemPrompt: string;
    messages: Message[];
    tools: unknown[]; // Provider-specific tool definitions
  }): Promise<LLMResponse>;
}
