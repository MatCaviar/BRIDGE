import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

export function registerSeatTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "set_seat_ventilation",
    {
      description: "Set ventilation",
      inputSchema: {
      seat: z.enum(["driver", "passenger"]),
      level: z.number(),
      enabled: z.boolean().optional()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["set_seat_ventilation"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.setVentilation(input.seat as string, input.level as number, input.enabled as boolean);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "seat");
        }
        return formatError(1000, String(error), "seat");
      }
    },
  );


}
