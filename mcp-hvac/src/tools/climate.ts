import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { CLIMATE_TEMP_OUT_OF_RANGE, CLIMATE_FAN_SPEED_INVALID, CLIMATE_AC_UNAVAILABLE, CLIMATE_DEFROST_FAILED } from "../types/errors.js";
export function registerClimateTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "set_temperature",
    {
      description: "Set temperature",
      inputSchema: {
      value: z.number(),
      unit: z.enum(["celsius", "fahrenheit"]).optional()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["set_temperature"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.setTemperature(input.value as number, input.unit as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(CLIMATE_TEMP_OUT_OF_RANGE, error.message, "climate");
        }
        return formatError(CLIMATE_TEMP_OUT_OF_RANGE, String(error), "climate");
      }
    },
  );


  server.registerTool(
    "set_fan_speed",
    {
      description: "Set fan speed",
      inputSchema: {
      speed: z.number(),
      zone: z.enum(["front", "rear", "all"])
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["set_fan_speed"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.setFanSpeed(input.speed as number, input.zone as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(CLIMATE_TEMP_OUT_OF_RANGE, error.message, "climate");
        }
        return formatError(CLIMATE_TEMP_OUT_OF_RANGE, String(error), "climate");
      }
    },
  );


  server.registerTool(
    "toggle_ac",
    {
      description: "Toggle ac",
      inputSchema: {
      enabled: z.boolean()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["toggle_ac"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.toggleAc(input.enabled as boolean);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(CLIMATE_TEMP_OUT_OF_RANGE, error.message, "climate");
        }
        return formatError(CLIMATE_TEMP_OUT_OF_RANGE, String(error), "climate");
      }
    },
  );


  server.registerTool(
    "read_cabin_temperature",
    {
      description: "Read cabin temperature",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["read_cabin_temperature"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.readCabinTemperature();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(CLIMATE_TEMP_OUT_OF_RANGE, error.message, "climate");
        }
        return formatError(CLIMATE_TEMP_OUT_OF_RANGE, String(error), "climate");
      }
    },
  );


  server.registerTool(
    "defrost_front",
    {
      description: "Defrost windshield",
      inputSchema: {
      intensity: z.enum(["low", "medium", "high"])
    },
      annotations: safetyToAnnotations("p_gear_required"),
    },
    async (input) => {
      const level = registry["defrost_front"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.defrostWindshield(input.intensity as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(CLIMATE_DEFROST_FAILED, error.message, "climate");
        }
        return formatError(CLIMATE_DEFROST_FAILED, String(error), "climate");
      }
    },
  );


}
