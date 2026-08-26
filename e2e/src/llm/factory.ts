import type { LLMConfig, LLMClient } from "./types.js";
import { AnthropicClient } from "./anthropic.js";
import { OpenAIClient } from "./openai.js";
import { MockSchemaClient } from "./mock.js";

export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicClient(config);
    case "openai":
    case "qwen":
    case "glm":
    case "deepseek":
      return new OpenAIClient(config);
    case "mock":
      return new MockSchemaClient();
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
