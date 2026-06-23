import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";

export function registerLocksoundTools(server: McpServer, adapter: IAdapter): void {

  server.registerTool(
    "locksound_read",
    {
      description: "Read lock sound",
      inputSchema: {},
      annotations: safetyToAnnotations("readonly"),
    },
    async (input) => {
      try {
        const result = await adapter.readLockSound();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "locksound");
        }
        return formatError(1000, String(error), "locksound");
      }
    },
  );


  server.registerTool(
    "locksound_enable",
    {
      description: "Enable lock sound",
      inputSchema: {
      resourceCode: z.string()
    },
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.enableLockSound(input.resourceCode as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "locksound");
        }
        return formatError(1000, String(error), "locksound");
      }
    },
  );


  server.registerTool(
    "locksound_disable",
    {
      description: "Disable lock sound",
      inputSchema: {},
      annotations: safetyToAnnotations("normal"),
    },
    async (input) => {
      try {
        const result = await adapter.disableLockSound();
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(1000, error.message, "locksound");
        }
        return formatError(1000, String(error), "locksound");
      }
    },
  );


}
