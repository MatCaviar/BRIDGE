import { afterEach, describe, expect, it, vi } from "vitest";
import { registerHealthTool } from "../src/health.js";

describe("registerHealthTool", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers a health_check tool that returns adapter status", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    let handler: (() => Promise<{ content: Array<{ text: string }> }>) | undefined;
    const server = {
      tool: vi.fn((name, description, schema, registeredHandler) => {
        handler = registeredHandler;
      }),
    };

    registerHealthTool(server as never);

    expect(server.tool).toHaveBeenCalledWith("health_check", "Returns server health status", {}, expect.any(Function));
    expect(handler).toBeDefined();
    const response = await handler!();
    expect(JSON.parse(response.content[0].text)).toEqual({
      status: "ok",
      adapter: "connected",
      timestamp: "2026-01-02T03:04:05.000Z",
    });
  });
});
