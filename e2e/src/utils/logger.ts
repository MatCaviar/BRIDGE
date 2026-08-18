/**
 * Structured stderr logger — all output goes to stderr to avoid
 * corrupting MCP protocol messages on stdout.
 */

function timestamp(): string {
  return new Date().toISOString();
}

export function info(context: string, message: string, data?: unknown): void {
  process.stderr.write(
    JSON.stringify({
      timestamp: timestamp(),
      level: "info",
      context,
      message,
      ...(data !== undefined ? { data } : {}),
    }) + "\n",
  );
}

export function error(context: string, message: string, data?: unknown): void {
  process.stderr.write(
    JSON.stringify({
      timestamp: timestamp(),
      level: "error",
      context,
      message,
      ...(data !== undefined ? { data } : {}),
    }) + "\n",
  );
}

export function warn(context: string, message: string, data?: unknown): void {
  process.stderr.write(
    JSON.stringify({
      timestamp: timestamp(),
      level: "warn",
      context,
      message,
      ...(data !== undefined ? { data } : {}),
    }) + "\n",
  );
}
