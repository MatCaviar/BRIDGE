import type { LLMConfig, LLMClient } from "./types.js";
import { AnthropicClient } from "./anthropic.js";
import { OpenAIClient } from "./openai.js";

export function createLLMClient(config: LLMConfig): LLMClient {
  switch (config.provider) {
    case "anthropic":
      return new AnthropicClient(config);
    case "openai":
    case "qwen":
    case "glm":
    case "deepseek":
      return new OpenAIClient(config);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
