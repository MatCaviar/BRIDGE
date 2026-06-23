import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { SENSOR_SENSOR_UNAVAILABLE } from "../types/errors.js";
export function registerSensorTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "read_air_quality",
    {
      description: "Read aqi",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["read_air_quality"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.readAqi();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SENSOR_SENSOR_UNAVAILABLE, error.message, "sensor");
        }
        return formatError(SENSOR_SENSOR_UNAVAILABLE, String(error), "sensor");
      }
    },
  );


}
