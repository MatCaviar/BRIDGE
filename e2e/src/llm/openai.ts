import OpenAI, { type ClientOptions as OpenAIClientOptions } from "openai";
import type { ChatCompletionTool } from "openai/resources/chat/completions.js";
import type { LLMConfig, LLMClient, LLMResponse, ToolCall, Message } from "./types.js";
import { parseProviderToolName } from "../mcp/schema-convert.js";

function parseToolName(combined: string): { serverName: string; toolName: string } {
  return parseProviderToolName(combined);
}

function convertMessages(
  messages: Message[],
  systemPrompt: string,
): OpenAI.ChatCompletionMessageParam[] {
  const result: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        result.push({
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: `${tc.serverName}.${tc.toolName}`,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        });
      } else {
        result.push({ role: "assistant", content: msg.content });
      }
    } else if (msg.role === "tool_result") {
      if (!msg.toolCallId) {
        throw new Error("tool_result message requires toolCallId for OpenAI provider");
      }
      result.push({
        role: "tool",
        tool_call_id: msg.toolCallId,
        content: msg.content,
      });
    }
  }

  return result;
}

function mapStopReason(reason: string | null | undefined): LLMResponse["stopReason"] {
  switch (reason) {
    case "stop":
      return "end_turn";
    case "tool_calls":
      return "tool_use";
    case "length":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly maxTokens?: number;
  private readonly temperature?: number;

  constructor(config: LLMConfig) {
    const clientOptions: OpenAIClientOptions = { apiKey: config.apiKey };
    if (config.baseUrl) {
      clientOptions.baseURL = config.baseUrl;
    }
    this.client = new OpenAI(clientOptions);
    this.model = config.model;
    this.maxTokens = config.maxTokens;
    this.temperature = config.temperature;
  }

  async createMessage(params: {
    systemPrompt: string;
    messages: Message[];
    tools: unknown[];
  }): Promise<LLMResponse> {
    const apiMessages = convertMessages(params.messages, params.systemPrompt);

    const requestParams: OpenAI.ChatCompletionCreateParams = {
      model: this.model,
      messages: apiMessages,
    };

    if (this.maxTokens !== undefined) {
      requestParams.max_tokens = this.maxTokens;
    }

    if (this.temperature !== undefined) {
      requestParams.temperature = this.temperature;
    }

    if (params.tools.length > 0) {
      requestParams.tools = params.tools as ChatCompletionTool[];
    }

    // Provider-specific: disable thinking mode for DashScope/Qwen
    // OpenAI ignores unknown params, so this is safe for all providers
    (requestParams as unknown as Record<string, unknown>)["enable_thinking"] = false;

    const response = await this.client.chat.completions.create(requestParams);

    const choice = response.choices[0];
    const message = choice?.message;

    const text = message?.content ?? "";
    const stopReason = mapStopReason(choice?.finish_reason);

    const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((tc) => {
      const { serverName, toolName } = parseToolName(tc.function.name);
      let parsedArgs: Record<string, unknown>;
      try {
        parsedArgs = JSON.parse(tc.function.arguments);
      } catch {
        throw new Error(
          `Failed to parse tool call arguments for "${tc.function.name}": ${tc.function.arguments}`,
        );
      }
      return {
        id: tc.id,
        serverName,
        toolName,
        arguments: parsedArgs,
      };
    });

    return {
      text,
      toolCalls,
      stopReason,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}
