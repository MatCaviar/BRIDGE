import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerGracefulShutdown(server: McpServer): void {
  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    process.stderr.write(`[shutdown] Received ${signal}, closing server...\n`);
    try {
      await server.close();
    } catch (err) {
      process.stderr.write(`[shutdown] Error closing: ${err}\n`);
    }
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
