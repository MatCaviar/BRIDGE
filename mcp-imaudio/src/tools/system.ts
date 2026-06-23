import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";

import { SYSTEM_APP_NOT_READY } from "../types/errors.js";
export function registerSystemTools(server: McpServer, adapter: IAdapter): void {

  server.registerTool(
    "appstatus_read",
    {
      description: "Read app status",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readAppStatus();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SYSTEM_APP_NOT_READY, error.message, "system");
        }
        return formatError(SYSTEM_APP_NOT_READY, String(error), "system");
      }
    },
  );


}
