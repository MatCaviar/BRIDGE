/**
 * Schema conversion between MCP tool definitions and LLM provider formats.
 *
 * MCP tools use `inputSchema` (JSON Schema). Each LLM provider wraps this
 * schema in a different envelope. The conversion is a structural mapping with
 * no semantic transformation — tool names are qualified as "serverName.toolName".
 */

import type { McpToolDef } from "./types.js";

// ---------------------------------------------------------------------------
// Provider-specific tool definition types
// ---------------------------------------------------------------------------

/** Anthropic Claude tool definition envelope. */
export interface AnthropicToolDef {
  readonly name: string;
  readonly description: string;
  readonly input_schema: Record<string, unknown>;
}

/** OpenAI Chat Completions tool definition envelope. */
export interface OpenAIToolDef {
  readonly type: "function";
  readonly function: {
    readonly name: string;
    readonly description: string;
    readonly parameters: Record<string, unknown>;
  };
}

/** Union of all supported LLM tool definition formats. */
export type LLMToolDef = AnthropicToolDef | OpenAIToolDef;

// ---------------------------------------------------------------------------
// Conversion functions
// ---------------------------------------------------------------------------

/**
 * Convert MCP tool definitions to the Anthropic tool format.
 *
 * Maps MCP `inputSchema` directly to Anthropic `input_schema`, using the
 * qualified tool name (`serverName.toolName`).
 */
export function convertToAnthropic(
  tools: readonly McpToolDef[],
): AnthropicToolDef[] {
  return tools.map((tool) =>
    Object.freeze({
      name: tool.qualifiedName,
      description: tool.description,
      input_schema: tool.inputSchema,
    }) satisfies AnthropicToolDef,
  );
}

/**
 * Convert MCP tool definitions to the OpenAI function-calling format.
 *
 * Wraps each tool in `{ type: "function", function: { ... } }` with MCP
 * `inputSchema` mapped to `parameters`.
 */
export function convertToOpenAI(
  tools: readonly McpToolDef[],
): OpenAIToolDef[] {
  return tools.map((tool) =>
    Object.freeze({
      type: "function" as const,
      function: Object.freeze({
        name: tool.qualifiedName,
        description: tool.description,
        parameters: tool.inputSchema,
      }),
    }) satisfies OpenAIToolDef,
  );
}

/**
 * Convert MCP tool definitions to the format expected by the given provider.
 *
 * @param tools    - MCP tool definitions to convert.
 * @param provider - Provider identifier: "anthropic" | "openai".
 * @returns An array of provider-specific tool definitions.
 * @throws Error if the provider is not supported.
 */
export function convertSchemas(
  tools: readonly McpToolDef[],
  provider: string,
): LLMToolDef[] {
  switch (provider) {
    case "anthropic":
      return convertToAnthropic(tools);
    case "openai":
      return convertToOpenAI(tools);
    default:
      throw new Error(
        `Unsupported LLM provider "${provider}" — supported: anthropic, openai`,
      );
  }
}
