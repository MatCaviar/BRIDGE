import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";

export function registerEqualizerTools(server: McpServer, adapter: IAdapter): void {

  server.registerTool(
    "equalizer_read",
    {
      description: "Read equalizer",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readEqualizer();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "equalizer");
        }
        return formatError(1000, String(error), "equalizer");
      }
    },
  );


  server.registerTool(
    "equalizer_preset_set",
    {
      description: "Set equalizer preset",
      inputSchema: {
      preset: z.enum(["0", "1", "2", "3"])
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.setEqualizerPreset(input.preset as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "equalizer");
        }
        return formatError(1000, String(error), "equalizer");
      }
    },
  );


  server.registerTool(
    "equalizer_custom_set",
    {
      description: "Set custom equalizer",
      inputSchema: {
      effectId: z.string(),
      values: z.string()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.setCustomEqualizer(input.effectId as string, input.values as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "equalizer");
        }
        return formatError(1000, String(error), "equalizer");
      }
    },
  );


  server.registerTool(
    "equalizer_custom_save",
    {
      description: "Save custom equalizer",
      inputSchema: {
      name: z.string(),
      values: z.string()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.saveCustomEqualizer(input.name as string, input.values as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "equalizer");
        }
        return formatError(1000, String(error), "equalizer");
      }
    },
  );


}
