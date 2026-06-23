import { describe, it, expect, vi } from "vitest";
import { createYunosAdapter } from "../../src/adapters/yunos-adapter.js";
import type { AdbConfig } from "../../src/config.js";

const CFG: AdbConfig = { path: "adb", use_host: true, timeout_ms: 10000 };

describe("yunos-adapter soundstage via rpc", () => {
  it("readSoundStage maps rpc data to SoundstageReadResult", async () => {
    const rpcFn = vi.fn().mockResolvedValue({ mode: "all", fade: 1, balance: 2 });
    const a = createYunosAdapter(CFG, rpcFn);
    const r = await a.readSoundStage();
    expect(r.success).toBe(true);
    expect(r.mode).toBe("all");
    expect(r.fade).toBe(1);
    expect(r.balance).toBe(2);
    expect(r.vncEnabled).toBe(false);
    expect(r.isAtmosPlaying).toBe(false);
    expect(rpcFn).toHaveBeenCalledWith("soundstage.read", {}, CFG);
  });

  it("setSoundStage calls rpc and echoes back", async () => {
    const rpcFn = vi.fn().mockResolvedValue({});
    const a = createYunosAdapter(CFG, rpcFn);
    const r = await a.setSoundStage(1, 0, 0);
    expect(r.success).toBe(true);
    expect(r.mode).toBe("1");
    expect(r.fade).toBe(0);
    expect(r.balance).toBe(0);
    expect(rpcFn).toHaveBeenCalledWith("soundstage.set", { mode: 1, fade: 0, balance: 0 }, CFG);
  });
});
