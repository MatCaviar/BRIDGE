const SENSITIVE_KEYS = new Set(["password", "ssid", "token", "secret", "apiKey", "api_key"]);

function redact(params: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : value;
  }
  return result;
}

function serialiseError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  try {
    return { value: JSON.parse(JSON.stringify(error)) };
  } catch {
    return { value: String(error) };
  }
}

export interface ToolLogger {
  before(toolName: string, params: Record<string, unknown>): void;
  after(toolName: string, durationMs: number): void;
  error(toolName: string, err: unknown): void;
}

export function createToolLogger(write?: (data: string) => boolean): ToolLogger {
  const writeFn = write ?? ((data: string) => process.stderr.write(data));

  function log(entry: Record<string, unknown>): void {
    writeFn(JSON.stringify({ ...entry, timestamp: new Date().toISOString() }) + "\n");
  }

  return {
    before(toolName: string, params: Record<string, unknown>): void {
      log({ event: "tool.before", tool: toolName, params: redact(params) });
    },
    after(toolName: string, durationMs: number): void {
      log({ event: "tool.after", tool: toolName, durationMs });
    },
    error(toolName: string, err: unknown): void {
      log({ event: "tool.error", tool: toolName, error: serialiseError(err) });
    },
  };
}
