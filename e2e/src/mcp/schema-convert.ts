/**
 * Schema conversion between MCP tool definitions and LLM provider formats.
 *
 * MCP tools use `inputSchema` (JSON Schema). Each LLM provider wraps this
 * schema in a different envelope. The conversion is a structural mapping with
 * no semantic transformation — tool names are provider-safely qualified as
 * "serverName__toolName".
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

/** Provider-safe qualified name. Dots are valid inside MCP but rejected by common function APIs. */
export function providerToolName(serverName: string, toolName: string): string {
  const value = `${serverName}__${toolName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (value.length > 64) {
    throw new Error(`Qualified function name exceeds provider limit (64): ${value}`);
  }
  return value;
}

/** Decode current "server__tool" names; accept the previous "server.tool" form for compatibility. */
export function parseProviderToolName(combined: string): { serverName: string; toolName: string } {
  const separator = combined.indexOf("__");
  if (separator >= 0) {
    return { serverName: combined.slice(0, separator), toolName: combined.slice(separator + 2) };
  }
  const dot = combined.indexOf(".");
  if (dot >= 0) return { serverName: combined.slice(0, dot), toolName: combined.slice(dot + 1) };
  return { serverName: combined, toolName: combined };
}

// ---------------------------------------------------------------------------
// Conversion functions
// ---------------------------------------------------------------------------

/**
 * Convert MCP tool definitions to the Anthropic tool format.
 *
 * Maps MCP `inputSchema` directly to Anthropic `input_schema`, using the
 * provider-safe qualified tool name (`serverName__toolName`).
 */
export function convertToAnthropic(
  tools: readonly McpToolDef[],
): AnthropicToolDef[] {
  return tools.map((tool) =>
    Object.freeze({
      name: providerToolName(tool.serverName, tool.name),
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
        name: providerToolName(tool.serverName, tool.name),
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
    case "mock":
      return convertToOpenAI(tools);
    default:
      throw new Error(
        `Unsupported LLM provider "${provider}" — supported: anthropic, openai`,
      );
  }
}
