import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";

export function registerBeosonicTools(server: McpServer, adapter: IAdapter): void {

  server.registerTool(
    "beosonic_read",
    {
      description: "Read beosonic",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readBeosonic();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "beosonic");
        }
        return formatError(1000, String(error), "beosonic");
      }
    },
  );


  server.registerTool(
    "beosonic_preset_set",
    {
      description: "Set beosonic preset",
      inputSchema: {
      x: z.number(),
      y: z.number(),
      z: z.number().optional()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.setBeosonicPreset(input.x as number, input.y as number, input.z as number);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "beosonic");
        }
        return formatError(1000, String(error), "beosonic");
      }
    },
  );


}
