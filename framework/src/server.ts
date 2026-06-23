import type { ToolLogger } from "./middleware/logger.js";
import { wrapHandler } from "./middleware/error-handler.js";
import { formatError } from "./utils/response.js";
import type { SafetyLevel } from "./middleware/safety-guard.js";
import { SafetyGuardError } from "./middleware/safety-guard.js";

type SafetyGuard = (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>;
type ToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

export function createMiddlewareChain(
  guard: SafetyGuard,
  logger: ToolLogger,
  handler: ToolHandler,
  toolName: string,
  safetyLevel: SafetyLevel,
): (input: Record<string, unknown>) => Promise<unknown> {
  const wrappedHandler = wrapHandler(handler);

  return async (input: Record<string, unknown>) => {
    try {
      await guard(safetyLevel, input);
    } catch (error) {
      if (error instanceof SafetyGuardError) {
        return formatError(error.code, error.message, "safety");
      }
      return formatError(1000, error instanceof Error ? error.message : String(error), "general");
    }

    logger.before(toolName, input);
    const start = Date.now();
    const result = await wrappedHandler(input);
    logger.after(toolName, Date.now() - start);

    return result;
  };
}
