import { describe, it, expect } from "vitest";
import { formatResponse, formatSuccess, formatError } from "../src/utils/response.js";

describe("formatResponse", () => {
  it("wraps data in MCP content envelope", () => {
    const result = formatResponse({ status: "ok", count: 3 });
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ status: "ok", count: 3 }, null, 2) }],
    });
  });

  it("handles null data", () => {
    const result = formatResponse(null);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toBeNull();
  });

  it("creates new object on each call", () => {
    const a = formatResponse({ x: 1 });
    const b = formatResponse({ x: 1 });
    expect(a).not.toBe(b);
    expect(a.content).not.toBe(b.content);
  });
});

describe("formatSuccess", () => {
  it("wraps data with success: true", () => {
    const result = formatSuccess({ currentPage: "home", stackDepth: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({ success: true, data: { currentPage: "home", stackDepth: 1 } });
  });

  it("N3: does NOT double-wrap an already-shaped { success, ... } payload", () => {
    const dto = { success: true, mode: 1, fade: 0 };
    const result = formatSuccess(dto);
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    // Must flatten: success:true at top + the DTO fields, NOT { success:true, data:{success:true,...} }
    expect(parsed.success).toBe(true);
    expect(parsed.mode).toBe(1);
    expect(parsed.data).toBeUndefined();
  });

  it("N3: a failure DTO (success:false) is passed through (no forced success:true)", () => {
    const result = formatSuccess({ success: false, reason: "x" });
    const parsed = JSON.parse(result.content[0].text) as Record<string, unknown>;
    expect(parsed.success).toBe(false);
    expect(parsed.reason).toBe("x");
  });
});

describe("formatError", () => {
  it("creates structured error with code, message, domain", () => {
    const result = formatError(2001, "Page not found", "navigation");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual({
      success: false,
      error: { code: 2001, message: "Page not found", domain: "navigation" },
    });
    expect(result.isError).toBe(true);
  });

  it("uses provided message", () => {
    const result = formatError(1000, "Unknown error", "general");
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error.code).toBe(1000);
    expect(parsed.error.message).toBe("Unknown error");
  });

  it("includes isError flag", () => {
    const result = formatError(3001, "Capture failed", "pet");
    expect(result.isError).toBe(true);
  });
});
