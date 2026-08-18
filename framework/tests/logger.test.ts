import { describe, it, expect } from "vitest";
import { createToolLogger } from "../src/middleware/logger.js";

describe("createToolLogger", () => {
  it("logs before event with tool name and params", () => {
    const output: string[] = [];
    const logger = createToolLogger((data) => { output.push(data); return true; });
    logger.before("navigate", { page: "home" });
    expect(output.length).toBe(1);
    const parsed = JSON.parse(output[0]);
    expect(parsed.event).toBe("tool.before");
    expect(parsed.tool).toBe("navigate");
    expect(parsed.params).toEqual({ page: "home" });
  });

  it("logs after event with duration", () => {
    const output: string[] = [];
    const logger = createToolLogger((data) => { output.push(data); return true; });
    logger.after("navigate", 150);
    const parsed = JSON.parse(output[0]);
    expect(parsed.event).toBe("tool.after");
    expect(parsed.tool).toBe("navigate");
    expect(parsed.durationMs).toBe(150);
  });

  it("logs error event", () => {
    const output: string[] = [];
    const logger = createToolLogger((data) => { output.push(data); return true; });
    logger.error("navigate", new Error("router crashed"));
    const parsed = JSON.parse(output[0]);
    expect(parsed.event).toBe("tool.error");
    expect(parsed.tool).toBe("navigate");
    expect(parsed.error.message).toBe("router crashed");
  });

  it("redacts sensitive fields in params", () => {
    const output: string[] = [];
    const logger = createToolLogger((data) => { output.push(data); return true; });
    logger.before("get_hotspot_info", { password: "secret123", ssid: "mywifi", safe: "ok" });
    const parsed = JSON.parse(output[0]);
    expect(parsed.params.password).toBe("[REDACTED]");
    expect(parsed.params.ssid).toBe("[REDACTED]");
    expect(parsed.params.safe).toBe("ok");
  });

  it("includes ISO timestamp", () => {
    const output: string[] = [];
    const logger = createToolLogger((data) => { output.push(data); return true; });
    logger.before("test", {});
    const parsed = JSON.parse(output[0]);
    expect(typeof parsed.timestamp).toBe("string");
    expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
