import { z } from "zod";
import type { IAdapter } from "../adapters/types.js";
import { formatSuccess, formatError } from "@im/mcp-server-framework";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { safetyToAnnotations } from "./registry.js";
import type { SafetyLevel } from "@im/mcp-server-framework";

import { PET_CAPTURE_FAILED, PET_UPLOAD_FAILED, PET_GENERATE_FAILED, PET_APPLY_FAILED } from "../types/errors.js";
export function registerPetTools(server: McpServer, adapter: IAdapter, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>): void {

  server.registerTool(
    "capture_photo",
    {
      description: "Capture pet",
      inputSchema: {
      fps: z.number()
    },
      annotations: safetyToAnnotations("p_gear_required"),
    },
    async (input) => {
      const level = registry["capture_photo"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.capturePet(input.fps as number);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(PET_CAPTURE_FAILED, error.message, "pet");
        }
        return formatError(PET_CAPTURE_FAILED, String(error), "pet");
      }
    },
  );


  server.registerTool(
    "upload_pet_image",
    {
      description: "Upload pet image",
      inputSchema: {
      imagePath: z.string()
    },
      annotations: safetyToAnnotations("p_gear_required"),
    },
    async (input) => {
      const level = registry["upload_pet_image"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.uploadPetImage(input.imagePath as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(PET_UPLOAD_FAILED, error.message, "pet");
        }
        return formatError(PET_UPLOAD_FAILED, String(error), "pet");
      }
    },
  );


  server.registerTool(
    "generate_pet_avatar",
    {
      description: "Generate pet avatar",
      inputSchema: {
      style: z.enum(["cartoon", "realistic", "sketch", "anime"]),
      imagePath: z.string()
    },
      annotations: safetyToAnnotations("p_gear_required"),
    },
    async (input) => {
      const level = registry["generate_pet_avatar"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.generatePetAvatar(input.style as string, input.imagePath as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(PET_GENERATE_FAILED, error.message, "pet");
        }
        return formatError(PET_GENERATE_FAILED, String(error), "pet");
      }
    },
  );


  server.registerTool(
    "apply_pet_avatar",
    {
      description: "Apply pet avatar",
      inputSchema: {
      avatarUrl: z.string(),
      scene: z.enum(["screensaver", "avatar", "desktop_card"]),
      confirmed: z.boolean()
    },
      annotations: safetyToAnnotations("p_gear_and_confirm"),
    },
    async (input) => {
      const level = registry["apply_pet_avatar"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.applyPetAvatar(input.avatarUrl as string, input.scene as string, input.confirmed as boolean);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(PET_APPLY_FAILED, error.message, "pet");
        }
        return formatError(PET_APPLY_FAILED, String(error), "pet");
      }
    },
  );


  server.registerTool(
    "regenerate_pet_avatar",
    {
      description: "Regenerate pet avatar",
      inputSchema: {
      style: z.enum(["cartoon", "realistic", "sketch", "anime"])
    },
      annotations: safetyToAnnotations("p_gear_required"),
    },
    async (input) => {
      const level = registry["regenerate_pet_avatar"] as SafetyLevel;
      await guard(level, input as Record<string, unknown>);
      try {
        const result = await adapter.regeneratePetAvatar(input.style as string);
        return formatSuccess(result);
      } catch (error) {
        if (error instanceof Error) {
          return formatError(PET_GENERATE_FAILED, error.message, "pet");
        }
        return formatError(PET_GENERATE_FAILED, String(error), "pet");
      }
    },
  );


}
