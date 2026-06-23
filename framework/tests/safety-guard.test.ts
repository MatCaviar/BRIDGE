import { describe, it, expect, vi } from "vitest";
import { createSafetyGuard, SafetyGuardError } from "../src/middleware/safety-guard.js";

function mockAdapter(overrides: Record<string, unknown> = {}) {
  return {
    getGearStatus: overrides.getGearStatus as (() => Promise<unknown>) ?? vi.fn().mockResolvedValue({ isParked: true, ignoreMode: false, rawValue: 2 }),
    getHotspotInfo: overrides.getHotspotInfo as (() => Promise<unknown>) ?? vi.fn().mockResolvedValue({ ssid: "mywifi", password: "pass", qrCodeData: null, instructions: "" }),
  };
}

describe("createSafetyGuard", () => {
  it("allows readonly tools without checks", async () => {
    const guard = createSafetyGuard(mockAdapter());
    await expect(guard("readonly", {})).resolves.toBeUndefined();
  });

  it("allows normal tools without checks", async () => {
    const guard = createSafetyGuard(mockAdapter());
    await expect(guard("normal", {})).resolves.toBeUndefined();
  });

  it("allows p_gear_required when parked", async () => {
    const guard = createSafetyGuard(mockAdapter());
    await expect(guard("p_gear_required", {})).resolves.toBeUndefined();
  });

  it("rejects p_gear_required when not parked", async () => {
    const adapter = mockAdapter({ getGearStatus: vi.fn().mockResolvedValue({ isParked: false, ignoreMode: false, rawValue: 1 }) });
    const guard = createSafetyGuard(adapter);
    await expect(guard("p_gear_required", {})).rejects.toThrow(SafetyGuardError);
  });

  it("allows p_gear_required when not parked BUT ignoreMode is true", async () => {
    const adapter = mockAdapter({ getGearStatus: vi.fn().mockResolvedValue({ isParked: false, ignoreMode: true, rawValue: 1 }) });
    const guard = createSafetyGuard(adapter);
    await expect(guard("p_gear_required", {})).resolves.toBeUndefined();
  });

  it("allows p_gear_and_confirm when parked and confirmed", async () => {
    const guard = createSafetyGuard(mockAdapter());
    await expect(guard("p_gear_and_confirm", { confirmed: true })).resolves.toBeUndefined();
  });

  it("rejects p_gear_and_confirm when not confirmed", async () => {
    const guard = createSafetyGuard(mockAdapter());
    await expect(guard("p_gear_and_confirm", { confirmed: false })).rejects.toThrow(SafetyGuardError);
  });

  it("rejects p_gear_and_confirm when confirmed is missing", async () => {
    const guard = createSafetyGuard(mockAdapter());
    await expect(guard("p_gear_and_confirm", {})).rejects.toThrow(SafetyGuardError);
  });

  it("allows p_gear_and_network when parked and hotspot active", async () => {
    const guard = createSafetyGuard(mockAdapter());
    await expect(guard("p_gear_and_network", {})).resolves.toBeUndefined();
  });

  it("rejects p_gear_and_network when hotspot is off", async () => {
    const adapter = mockAdapter({ getHotspotInfo: vi.fn().mockResolvedValue({ ssid: null, password: null, qrCodeData: null, instructions: "" }) });
    const guard = createSafetyGuard(adapter);
    await expect(guard("p_gear_and_network", {})).rejects.toThrow(SafetyGuardError);
  });

  it("propagates adapter errors without wrapping", async () => {
    const adapter = mockAdapter({ getGearStatus: vi.fn().mockRejectedValue(new Error("bus timeout")) });
    const guard = createSafetyGuard(adapter);
    await expect(guard("p_gear_required", {})).rejects.toThrow("bus timeout");
  });

  it("SafetyGuardError has code property", async () => {
    const adapter = mockAdapter({ getGearStatus: vi.fn().mockResolvedValue({ isParked: false, ignoreMode: false, rawValue: 1 }) });
    const guard = createSafetyGuard(adapter);
    try {
      await guard("p_gear_required", {});
      expect.unreachable("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(SafetyGuardError);
      expect((error as SafetyGuardError).code).toBe(4001);
    }
  });
});
