import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { VEHICLE_SENSOR_UNAVAILABLE, VEHICLE_GEAR_READ_FAILED } from "../types/errors.js";
export function registerVehicleTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "get_vehicle_info",
    {
      description: "Get vehicle info",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["get_vehicle_info"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.getVehicleInfo();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(VEHICLE_SENSOR_UNAVAILABLE, error.message, "vehicle");
        }
        return formatError(VEHICLE_SENSOR_UNAVAILABLE, String(error), "vehicle");
      }
    },
  );


  server.registerTool(
    "get_gear_status",
    {
      description: "Read gear status",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["get_gear_status"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.readGearStatus();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(VEHICLE_GEAR_READ_FAILED, error.message, "vehicle");
        }
        return formatError(VEHICLE_GEAR_READ_FAILED, String(error), "vehicle");
      }
    },
  );


  server.registerTool(
    "on_gear_changed",
    {
      description: "Subscribe gear",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["on_gear_changed"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.subscribeGear();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(VEHICLE_SENSOR_UNAVAILABLE, error.message, "vehicle");
        }
        return formatError(VEHICLE_SENSOR_UNAVAILABLE, String(error), "vehicle");
      }
    },
  );


}
