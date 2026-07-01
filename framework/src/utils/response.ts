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

export function formatSuccess(data: unknown): McpResponse {
  return formatResponse({ success: true, data });
}

export function formatError(
  code: number,
  message: string,
  domain: string,
): McpResponse {
  const payload = { success: false, error: { code, message, domain } };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }], isError: true };
}
