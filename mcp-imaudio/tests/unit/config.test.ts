import { describe, it, expect } from "vitest";
import { readConfig } from "../../src/config.js";
import { resolve } from "path";

describe("readConfig", () => {
  it("parses adb config with absolute path resolution", () => {
    const cfg = readConfig(resolve(__dirname, "../../conf/config.yaml"));
    expect(cfg.adapter.mock_mode).toBe(false);
    expect(cfg.adb).toBeDefined();
    expect(cfg.adb!.path).toMatch(/[A-Z]:\\.*adb\.exe$/); // 绝对路径
    expect(cfg.adb!.use_host).toBe(true);
    expect(cfg.adb!.timeout_ms).toBe(10000);
  });
});
