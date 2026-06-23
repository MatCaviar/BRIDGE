import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";

export function registerKaraokeTools(server: McpServer, adapter: IAdapter): void {

  server.registerTool(
    "karaoke_read",
    {
      description: "Read karaoke",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readKaraoke();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "karaoke");
        }
        return formatError(1000, String(error), "karaoke");
      }
    },
  );


  server.registerTool(
    "karaoke_mode_set",
    {
      description: "Set karaoke mode",
      inputSchema: {
      mode: z.enum(["0", "1", "2"])
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.setKaraokeMode(Number(input.mode) as number);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "karaoke");
        }
        return formatError(1000, String(error), "karaoke");
      }
    },
  );


}
