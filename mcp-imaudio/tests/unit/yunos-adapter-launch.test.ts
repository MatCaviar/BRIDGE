import { describe, it, expect } from "vitest";
import { createYunosAdapter } from "../../src/adapters/yunos-adapter.js";
import type { AdbConfig } from "../../src/config.js";

const STUB_CONFIG: AdbConfig = {
  path: "D:/IM/im-mcp-codeagent/tools/adb/adb.exe",
  use_host: true,
  timeout_ms: 10000,
};

describe("yunos-adapter launchApp", () => {
  it("throws on unknown appName (does not call adb)", async () => {
    const adapter = createYunosAdapter(STUB_CONFIG);
    await expect(adapter.launchApp("nonexistent")).rejects.toThrow(/unknown app/);
  });
});
