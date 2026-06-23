import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { TRANSFER_HOTSPOT_UNAVAILABLE, TRANSFER_QR_GENERATE_FAILED, TRANSFER_TRANSFER_FAILED } from "../types/errors.js";
export function registerTransferTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "get_hotspot_info",
    {
      description: "Get hotspot info",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["get_hotspot_info"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.getHotspotInfo();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(TRANSFER_HOTSPOT_UNAVAILABLE, error.message, "transfer");
        }
        return formatError(TRANSFER_HOTSPOT_UNAVAILABLE, String(error), "transfer");
      }
    },
  );


  server.registerTool(
    "generate_qr_code",
    {
      description: "Generate qr code",
      inputSchema: {
      data: z.string()
    },
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      const level = registry["generate_qr_code"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.generateQrCode(input.data as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(TRANSFER_QR_GENERATE_FAILED, error.message, "transfer");
        }
        return formatError(TRANSFER_QR_GENERATE_FAILED, String(error), "transfer");
      }
    },
  );


  server.registerTool(
    "transfer_to_phone",
    {
      description: "Transfer phone",
      inputSchema: {
      data: z.string(),
      ssid: z.string()
    },
      annotations: safetyToAnnotations("p_gear_and_network"),
    },
    async (input) => {
      const level = registry["transfer_to_phone"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.transferPhone(input.data as string, input.ssid as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(TRANSFER_TRANSFER_FAILED, error.message, "transfer");
        }
        return formatError(TRANSFER_TRANSFER_FAILED, String(error), "transfer");
      }
    },
  );


}
