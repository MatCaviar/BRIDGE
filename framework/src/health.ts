import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatResponse } from "./utils/response.js";

export function registerHealthTool(server: McpServer): void {
  server.tool(
    "health_check",
    "Returns server health status",
    {},
    async () => formatResponse({
      status: "ok",
      adapter: "connected",
      timestamp: new Date().toISOString(),
    }),
  );
}
