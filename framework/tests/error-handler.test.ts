import { describe, it, expect, vi } from "vitest";
import { wrapHandler } from "../src/middleware/error-handler.js";
import { SafetyGuardError } from "../src/middleware/safety-guard.js";

describe("wrapHandler", () => {
  it("passes through successful handler results", async () => {
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
    const wrapped = wrapHandler(handler);
    const result = await wrapped({});
    expect(result.content[0].text).toBe("ok");
  });

  it("catches SafetyGuardError and returns MCP error response", async () => {
    const handler = vi.fn().mockRejectedValue(new SafetyGuardError(4001, "Not parked"));
    const wrapped = wrapHandler(handler);
    const result = await wrapped({}) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe(4001);
    expect(parsed.error.domain).toBe("safety");
  });

  it("catches generic errors and returns structured error response", async () => {
    const handler = vi.fn().mockRejectedValue(new Error("Something broke"));
    const wrapped = wrapHandler(handler);
    const result = await wrapped({}) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.message).toBe("Something broke");
    expect(parsed.error.domain).toBe("general");
  });

  it("handles non-Error throws", async () => {
    const handler = vi.fn().mockRejectedValue("string error");
    const wrapped = wrapHandler(handler);
    const result = await wrapped({}) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.message).toBe("string error");
  });
});
