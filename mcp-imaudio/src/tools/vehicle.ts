import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";

import { VEHICLE_VIN_UNAVAILABLE } from "../types/errors.js";
export function registerVehicleTools(server: McpServer, adapter: IAdapter): void {

  server.registerTool(
    "carinfo_read",
    {
      description: "Read car info",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readCarInfo();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(VEHICLE_VIN_UNAVAILABLE, error.message, "vehicle");
        }
        return formatError(VEHICLE_VIN_UNAVAILABLE, String(error), "vehicle");
      }
    },
  );


}
