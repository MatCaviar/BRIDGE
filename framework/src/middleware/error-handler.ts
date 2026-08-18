import { formatError } from "../utils/response.js";
import { SafetyGuardError } from "./safety-guard.js";

type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export function wrapHandler(handler: ToolHandler): ToolHandler {
  return async (input: Record<string, unknown>) => {
    try {
      return await handler(input);
    } catch (error) {
      if (error instanceof SafetyGuardError) {
        return formatError(error.code, error.message, "safety");
      }
      if (error instanceof Error) {
        return formatError(1000, error.message, "general");
      }
      return formatError(1000, String(error), "general");
    }
  };
}
