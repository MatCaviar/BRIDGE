/** MCP text-content response helpers used by the host-side serve command. */
export interface TextContent {
  readonly type: "text";
  readonly text: string;
}

export interface McpResponse {
  readonly content: TextContent[];
  readonly isError?: boolean;
  [key: string]: unknown;
}

export function formatResponse(data: unknown): McpResponse {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
