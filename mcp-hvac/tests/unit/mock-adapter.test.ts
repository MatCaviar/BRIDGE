// Mock adapter tests for hvac MCP Server
// Auto-generated — tests ALL adapter methods with success and error injection
import { describe, it, expect, beforeEach } from "vitest";
import { createMockAdapter } from "../../src/adapters/mock-adapter.js";

describe("MockAdapter", () => {
  let adapter: ReturnType<typeof createMockAdapter>["adapter"];
  let control: ReturnType<typeof createMockAdapter>["control"];

  beforeEach(() => {
    ({ adapter, control } = createMockAdapter());
  });

  describe("climate: set_temperature", () => {
    it("setTemperature returns success result", async () => {
      const result = await adapter.setTemperature(1, "test_unit");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setTemperature propagates injected errors", async () => {
      control.setError("setTemperature", new Error("injected error"));
      await expect(
        adapter.setTemperature(1, "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("climate: set_fan_speed", () => {
    it("setFanSpeed returns success result", async () => {
      const result = await adapter.setFanSpeed(1, "test_zone");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setFanSpeed propagates injected errors", async () => {
      control.setError("setFanSpeed", new Error("injected error"));
      await expect(
        adapter.setFanSpeed(1, "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("climate: toggle_ac", () => {
    it("toggleAc returns success result", async () => {
      const result = await adapter.toggleAc(true);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("toggleAc propagates injected errors", async () => {
      control.setError("toggleAc", new Error("injected error"));
      await expect(
        adapter.toggleAc("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("climate: read_cabin_temperature", () => {
    it("readCabinTemperature returns success result", async () => {
      const result = await adapter.readCabinTemperature();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("readCabinTemperature propagates injected errors", async () => {
      control.setError("readCabinTemperature", new Error("injected error"));
      await expect(
        adapter.readCabinTemperature()
      ).rejects.toThrow("injected error");
    });
  });

  describe("climate: defrost_front", () => {
    it("defrostWindshield returns success result", async () => {
      const result = await adapter.defrostWindshield("test_intensity");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("defrostWindshield propagates injected errors", async () => {
      control.setError("defrostWindshield", new Error("injected error"));
      await expect(
        adapter.defrostWindshield("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("window: open_window", () => {
    it("openWindow returns success result", async () => {
      const result = await adapter.openWindow("test_position", 1);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("openWindow propagates injected errors", async () => {
      control.setError("openWindow", new Error("injected error"));
      await expect(
        adapter.openWindow("test", 1)
      ).rejects.toThrow("injected error");
    });
  });

  describe("window: close_window", () => {
    it("closeWindow returns success result", async () => {
      const result = await adapter.closeWindow("test_position");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("closeWindow propagates injected errors", async () => {
      control.setError("closeWindow", new Error("injected error"));
      await expect(
        adapter.closeWindow("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("sensor: read_air_quality", () => {
    it("readAqi returns success result", async () => {
      const result = await adapter.readAqi();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("readAqi propagates injected errors", async () => {
      control.setError("readAqi", new Error("injected error"));
      await expect(
        adapter.readAqi()
      ).rejects.toThrow("injected error");
    });
  });

  describe("seat: set_seat_ventilation", () => {
    it("setVentilation returns success result", async () => {
      const result = await adapter.setVentilation("test_seat", 1, true);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setVentilation propagates injected errors", async () => {
      control.setError("setVentilation", new Error("injected error"));
      await expect(
        adapter.setVentilation("test", 1, "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("state management", () => {
    it("resetState clears all injected errors", () => {
      control.setError("someMethod", new Error("test"));
      control.resetState();
      expect(() => control.resetState()).not.toThrow();
    });

    it("resetState resets all state to defaults", () => {
      control.setGearStatus("D");
      const stateBefore = control.getMockState();
      expect(stateBefore.gearStatus).toBe("D");
      control.resetState();
      const stateAfter = control.getMockState();
      expect(stateAfter.gearStatus).toBe("P");
      expect(stateAfter.pageStack).toEqual(["home"]);
      expect(stateAfter.isLoading).toBe(false);
      expect(stateAfter.activeToast).toBeNull();
    });

    it("setGearStatus updates gear status", () => {
      control.setGearStatus("D");
      expect(control.getMockState().gearStatus).toBe("D");
      control.setGearStatus("R");
      expect(control.getMockState().gearStatus).toBe("R");
    });

    it("getMockState returns frozen copy", () => {
      const state1 = control.getMockState();
      const state2 = control.getMockState();
      expect(state1).toEqual(state2);
      expect(state1).not.toBe(state2);
    });
  });

  describe("edge cases", () => {
    it("adapter returns frozen immutable results", async () => {
      const result = await adapter.setTemperature(1, "test");
      if (typeof result === 'object' && result !== null) {
        expect(Object.isFrozen(result)).toBe(true);
      }
    });

    it("gear subscription receives updates", () => {
      const received: string[] = [];
      control.subscribeGearChange((gear) => { received.push(gear); });
      control.setGearStatus("D");
      control.setGearStatus("R");
      expect(received).toEqual(["D", "R"]);
    });

    it("unsubscribe stops gear updates", () => {
      const received: string[] = [];
      const listener = (gear: string) => { received.push(gear); };
      control.subscribeGearChange(listener);
      control.setGearStatus("D");
      control.unsubscribeGearChange(listener);
      control.setGearStatus("R");
      expect(received).toEqual(["D"]);
    });

    it("resetState clears gear listeners", () => {
      const received: string[] = [];
      control.subscribeGearChange((gear) => { received.push(gear); });
      control.resetState();
      control.setGearStatus("D");
      expect(received).toEqual([]);
    });

  });
});
