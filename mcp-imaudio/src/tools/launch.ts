import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import { LAUNCH_APP_FAILED } from "../types/errors.js";

export function registerLaunchTools(server: McpServer, adapter: IAdapter): void {
  server.registerTool(
    "launch_app",
    {
      description: "Launch an application on the device via sendlink",
      inputSchema: {
        appName: z.enum(["imaudio", "lightpoint", "smartcar"]),
      },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.launchApp(input.appName as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(LAUNCH_APP_FAILED, error.message, "system");
        }
        return formatError(LAUNCH_APP_FAILED, String(error), "system");
      }
    },
  );
}
