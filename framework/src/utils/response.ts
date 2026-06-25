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
  // N3: if the adapter already returned a shaped DTO carrying its own `success` boolean,
  // pass it through verbatim — do NOT re-wrap (avoids the redundant { success:true, data:{success:true,...} }).
  if (data && typeof data === "object" && "success" in data && typeof (data as { success: unknown }).success === "boolean") {
    return formatResponse(data);
  }
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
