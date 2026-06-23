import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { WINDOW_WINDOW_BLOCKED, WINDOW_WINDOW_TIMEOUT } from "../types/errors.js";
export function registerWindowTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "open_window",
    {
      description: "Open window",
      inputSchema: {
      position: z.enum(["driver", "passenger", "rear_left", "rear_right"]),
      percentage: z.number()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["open_window"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.openWindow(input.position as string, input.percentage as number);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(WINDOW_WINDOW_BLOCKED, error.message, "window");
        }
        return formatError(WINDOW_WINDOW_BLOCKED, String(error), "window");
      }
    },
  );


  server.registerTool(
    "close_window",
    {
      description: "Close window",
      inputSchema: {
      position: z.enum(["driver", "passenger", "rear_left", "rear_right"])
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["close_window"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.closeWindow(input.position as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(WINDOW_WINDOW_BLOCKED, error.message, "window");
        }
        return formatError(WINDOW_WINDOW_BLOCKED, String(error), "window");
      }
    },
  );


}
