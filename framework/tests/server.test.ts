import { describe, it, expect, vi } from "vitest";
import { createMiddlewareChain } from "../src/server.js";
import { SafetyGuardError } from "../src/middleware/safety-guard.js";

describe("createMiddlewareChain", () => {
  it("chains guard, logging, and handler", async () => {
    const guardCalls: string[] = [];
    const logCalls: string[] = [];
    const guard = async () => { guardCalls.push("guard"); };
    const logger = {
      before: () => { logCalls.push("before"); },
      after: () => { logCalls.push("after"); },
      error: () => { logCalls.push("error"); },
    };
    const handler = async () => ({ content: [{ type: "text" as const, text: "ok" }] });

    const chain = createMiddlewareChain(guard, logger, handler, "test_tool", "normal");
    const result = await chain({});
    expect(guardCalls).toEqual(["guard"]);
    expect(logCalls).toEqual(["before", "after"]);
    expect(result.content[0].text).toBe("ok");
  });

  it("returns error response on guard failure", async () => {
    const guard = async () => { throw new SafetyGuardError(4001, "Not parked"); };
    const logger = { before: vi.fn(), after: vi.fn(), error: vi.fn() };
    const handler = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "should not reach" }] });

    const chain = createMiddlewareChain(guard, logger, handler, "test_tool", "p_gear_required");
    const result = await chain({}) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe(4001);
  });

  it("returns error response on handler failure", async () => {
    const guard = async () => {};
    const logger = { before: vi.fn(), after: vi.fn(), error: vi.fn() };
    const handler = async () => { throw new Error("handler crashed"); };

    const chain = createMiddlewareChain(guard, logger, handler, "test_tool", "normal");
    const result = await chain({}) as { isError?: boolean; content: Array<{ type: string; text: string }> };
    expect(result.isError).toBe(true);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.message).toBe("handler crashed");
  });
});
