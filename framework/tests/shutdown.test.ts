import { afterEach, describe, expect, it, vi } from "vitest";
import { registerGracefulShutdown } from "../src/shutdown.js";

describe("registerGracefulShutdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("registers SIGINT/SIGTERM handlers and closes the server once", async () => {
    const handlers = new Map<string, () => Promise<void>>();
    vi.spyOn(process, "on").mockImplementation((event, listener) => {
      handlers.set(String(event), listener as () => Promise<void>);
      return process;
    });
    vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(((code?: string | number | null) => {
      throw new Error(`process.exit:${code}`);
    }) as never);
    const server = { close: vi.fn().mockResolvedValue(undefined) };

    registerGracefulShutdown(server as never);

    expect([...handlers.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
    await expect(handlers.get("SIGINT")!()).rejects.toThrow("process.exit:0");
    expect(server.close).toHaveBeenCalledTimes(1);
    await expect(handlers.get("SIGTERM")!()).resolves.toBeUndefined();
    expect(server.close).toHaveBeenCalledTimes(1);
  });
});
