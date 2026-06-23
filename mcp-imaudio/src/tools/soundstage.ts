import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";

export function registerSoundstageTools(server: McpServer, adapter: IAdapter): void {

  server.registerTool(
    "soundstage_read",
    {
      description: "Read sound stage",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readSoundStage();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "soundstage");
        }
        return formatError(1000, String(error), "soundstage");
      }
    },
  );


  server.registerTool(
    "soundstage_set",
    {
      description: "Set sound stage",
      inputSchema: {
      mode: z.number(),
      fade: z.number().optional(),
      balance: z.number().optional()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.setSoundStage(input.mode as number, input.fade as number, input.balance as number);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "soundstage");
        }
        return formatError(1000, String(error), "soundstage");
      }
    },
  );


  server.registerTool(
    "vnc_status_read",
    {
      description: "Read vnc status",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readVncStatus();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "soundstage");
        }
        return formatError(1000, String(error), "soundstage");
      }
    },
  );


  server.registerTool(
    "vnc_status_set",
    {
      description: "Set vnc status",
      inputSchema: {
      enabled: z.boolean()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.setVncStatus(input.enabled as boolean);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "soundstage");
        }
        return formatError(1000, String(error), "soundstage");
      }
    },
  );


}
