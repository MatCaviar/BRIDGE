import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { SYSTEM_DISPLAY_ERROR, SYSTEM_ANIMATION_ERROR, SYSTEM_APP_NOT_READY } from "../types/errors.js";
export function registerSystemTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "get_app_status",
    {
      description: "Get app status",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["get_app_status"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.getAppStatus();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SYSTEM_DISPLAY_ERROR, error.message, "system");
        }
        return formatError(SYSTEM_DISPLAY_ERROR, String(error), "system");
      }
    },
  );


  server.registerTool(
    "get_display_info",
    {
      description: "Get display info",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["get_display_info"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.getDisplayInfo();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SYSTEM_DISPLAY_ERROR, error.message, "system");
        }
        return formatError(SYSTEM_DISPLAY_ERROR, String(error), "system");
      }
    },
  );


  server.registerTool(
    "show_toast",
    {
      description: "Show toast",
      inputSchema: {
      message: z.string(),
      align: z.enum(["top", "center", "bottom"]).optional()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["show_toast"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.showToast(input.message as string, input.align as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SYSTEM_DISPLAY_ERROR, error.message, "system");
        }
        return formatError(SYSTEM_DISPLAY_ERROR, String(error), "system");
      }
    },
  );


  server.registerTool(
    "show_loading",
    {
      description: "Show loading",
      inputSchema: {
      message: z.string().optional()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["show_loading"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.showLoading(input.message as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SYSTEM_DISPLAY_ERROR, error.message, "system");
        }
        return formatError(SYSTEM_DISPLAY_ERROR, String(error), "system");
      }
    },
  );


  server.registerTool(
    "hide_loading",
    {
      description: "Hide loading",
      inputSchema: {},
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["hide_loading"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.hideLoading();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SYSTEM_DISPLAY_ERROR, error.message, "system");
        }
        return formatError(SYSTEM_DISPLAY_ERROR, String(error), "system");
      }
    },
  );


  server.registerTool(
    "play_animation",
    {
      description: "Play animation",
      inputSchema: {
      _type: z.string(),
      duration: z.number().optional()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["play_animation"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.playAnimation(input._type as string, input.duration as number);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(SYSTEM_DISPLAY_ERROR, error.message, "system");
        }
        return formatError(SYSTEM_DISPLAY_ERROR, String(error), "system");
      }
    },
  );


}
