import { describe, it, expect, beforeEach } from "vitest";
import { registerCommand, execute, clearCommands } from "../../src/executors/adb-executor.js";
import type { AdbConfig } from "../../src/config.js";

const STUB_CONFIG: AdbConfig = {
  path: "D:/IM/im-mcp-codeagent/tools/adb/adb.exe",
  use_host: true,
  timeout_ms: 10000,
};

describe("adb-executor command registry", () => {
  beforeEach(() => clearCommands());

  it("rejects unknown command", async () => {
    const r = await execute("nonexistent", {}, STUB_CONFIG);
    expect(r.success).toBe(false);
    expect(r.rawOutput).toContain("unknown command");
  });

  it("sendlink command resolves against real device", async () => {
    registerCommand("sendlink", (a) => `shell sendlink ${a.url}`);
    const r = await execute("sendlink", { url: "page://imaudio.yunos.com/imaudio" }, STUB_CONFIG);
    expect(r.success).toBe(true);
    expect(r.parsed).toHaveProperty("targetPageId");
  });
});
