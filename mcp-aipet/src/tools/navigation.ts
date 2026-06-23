import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { NAV_PAGE_NOT_FOUND, NAV_STACK_OVERFLOW, NAV_ALREADY_ON_PAGE } from "../types/errors.js";
export function registerNavigationTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "navigate_to",
    {
      description: "Navigate to page",
      inputSchema: {
      pageName: z.enum(["home", "photo", "phone", "loading", "result", "setting"])
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["navigate_to"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.navigateToPage(input.pageName as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(NAV_PAGE_NOT_FOUND, error.message, "navigation");
        }
        return formatError(NAV_PAGE_NOT_FOUND, String(error), "navigation");
      }
    },
  );


  server.registerTool(
    "go_back",
    {
      description: "Go page back",
      inputSchema: {},
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      const level = registry["go_back"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.goPageBack();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(NAV_PAGE_NOT_FOUND, error.message, "navigation");
        }
        return formatError(NAV_PAGE_NOT_FOUND, String(error), "navigation");
      }
    },
  );


  server.registerTool(
    "get_current_page",
    {
      description: "Get page current",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["get_current_page"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.getPageCurrent();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(NAV_PAGE_NOT_FOUND, error.message, "navigation");
        }
        return formatError(NAV_PAGE_NOT_FOUND, String(error), "navigation");
      }
    },
  );


}
