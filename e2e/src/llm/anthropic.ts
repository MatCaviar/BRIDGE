import Anthropic, { type ClientOptions as AnthropicClientOptions } from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  ToolUseBlockParam,
  ContentBlockParam,
} from "@anthropic-ai/sdk/resources/messages.js";
import type { LLMConfig, LLMClient, LLMResponse, ToolCall, Message } from "./types.js";
import { parseProviderToolName } from "../mcp/schema-convert.js";

function parseToolName(combined: string): { serverName: string; toolName: string } {
  return parseProviderToolName(combined);
}

function convertMessages(messages: Message[]): MessageParam[] {
  const result: MessageParam[] = [];

  for (const msg of messages) {
    if (msg.role === "user") {
      result.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const blocks: ContentBlockParam[] = [];

        if (msg.content) {
          blocks.push({ type: "text", text: msg.content });
        }

        for (const tc of msg.toolCalls) {
          const block: ToolUseBlockParam = {
            type: "tool_use",
            id: tc.id,
            name: `${tc.serverName}.${tc.toolName}`,
            input: tc.arguments,
          };
          blocks.push(block);
        }

        result.push({ role: "assistant", content: blocks });
      } else {
        result.push({ role: "assistant", content: msg.content });
      }
    } else if (msg.role === "tool_result") {
      if (!msg.toolCallId) {
        throw new Error("tool_result message requires toolCallId for Anthropic provider");
      }
      const block: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: msg.content,
      };
      result.push({ role: "user", content: [block] });
    }
  }

  return result;
}

function mapStopReason(reason: string | null | undefined): LLMResponse["stopReason"] {
  switch (reason) {
    case "end_turn":
      return "end_turn";
    case "tool_use":
      return "tool_use";
    case "max_tokens":
      return "max_tokens";
    default:
      return "end_turn";
  }
}

export class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly temperature?: number;

  constructor(config: LLMConfig) {
    const clientOptions: AnthropicClientOptions = { apiKey: config.apiKey };
    if (config.baseUrl) {
      clientOptions.baseURL = config.baseUrl;
    }
    this.client = new Anthropic(clientOptions);
    this.model = config.model;
    this.maxTokens = config.maxTokens ?? 4096;
    this.temperature = config.temperature;
  }

  async createMessage(params: {
    systemPrompt: string;
    messages: Message[];
    tools: unknown[];
  }): Promise<LLMResponse> {
    const apiMessages = convertMessages(params.messages);

    const requestParams: Anthropic.MessageCreateParams = {
      model: this.model,
      max_tokens: this.maxTokens,
      system: params.systemPrompt,
      messages: apiMessages,
    };

    if (this.temperature !== undefined) {
      requestParams.temperature = this.temperature;
    }

    if (params.tools.length > 0) {
      requestParams.tools = params.tools as Anthropic.MessageCreateParams["tools"];
    }

    const response = await this.client.messages.create(requestParams);

    const textBlocks = response.content.filter((block) => block.type === "text");
    const text = textBlocks
      .map((block) => {
        const textBlock = block as { type: "text"; text: string };
        return textBlock.text;
      })
      .join("");

    const toolCalls: ToolCall[] = response.content
      .filter((block) => block.type === "tool_use")
      .map((block) => {
        const toolUseBlock = block as {
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, unknown>;
        };
        const { serverName, toolName } = parseToolName(toolUseBlock.name);
        return {
          id: toolUseBlock.id,
          serverName,
          toolName,
          arguments: toolUseBlock.input,
        };
      });

    return {
      text,
      toolCalls,
      stopReason: mapStopReason(response.stop_reason),
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }
}
