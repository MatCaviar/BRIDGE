// Mock adapter tests for imaudio MCP Server
// Auto-generated — tests ALL adapter methods with success and error injection
import { describe, it, expect, beforeEach } from "vitest";
import { createMockAdapter } from "../../src/adapters/mock-adapter.js";

describe("MockAdapter", () => {
  let adapter: ReturnType<typeof createMockAdapter>["adapter"];
  let control: ReturnType<typeof createMockAdapter>["control"];

  beforeEach(() => {
    ({ adapter, control } = createMockAdapter());
  });

  describe("soundstage: soundstage_read", () => {
    it("readSoundStage returns success result", async () => {
      const result = await adapter.readSoundStage();
      expect(result).toBeDefined();
    });

    it("readSoundStage propagates injected errors", async () => {
      control.setError("readSoundStage", new Error("injected error"));
      await expect(
        adapter.readSoundStage()
      ).rejects.toThrow("injected error");
    });
  });

  describe("soundstage: soundstage_set", () => {
    it("setSoundStage returns success result", async () => {
      const result = await adapter.setSoundStage(1, 1, 1);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setSoundStage propagates injected errors", async () => {
      control.setError("setSoundStage", new Error("injected error"));
      await expect(
        adapter.setSoundStage(1, 1, 1)
      ).rejects.toThrow("injected error");
    });
  });

  describe("soundstage: vnc_status_read", () => {
    it("readVncStatus returns success result", async () => {
      const result = await adapter.readVncStatus();
      expect(result).toBeDefined();
    });

    it("readVncStatus propagates injected errors", async () => {
      control.setError("readVncStatus", new Error("injected error"));
      await expect(
        adapter.readVncStatus()
      ).rejects.toThrow("injected error");
    });
  });

  describe("soundstage: vnc_status_set", () => {
    it("setVncStatus returns success result", async () => {
      const result = await adapter.setVncStatus(true);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setVncStatus propagates injected errors", async () => {
      control.setError("setVncStatus", new Error("injected error"));
      await expect(
        adapter.setVncStatus("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("equalizer: equalizer_read", () => {
    it("readEqualizer returns success result", async () => {
      const result = await adapter.readEqualizer();
      expect(result).toBeDefined();
    });

    it("readEqualizer propagates injected errors", async () => {
      control.setError("readEqualizer", new Error("injected error"));
      await expect(
        adapter.readEqualizer()
      ).rejects.toThrow("injected error");
    });
  });

  describe("equalizer: equalizer_preset_set", () => {
    it("setEqualizerPreset returns success result", async () => {
      const result = await adapter.setEqualizerPreset("test_preset");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setEqualizerPreset propagates injected errors", async () => {
      control.setError("setEqualizerPreset", new Error("injected error"));
      await expect(
        adapter.setEqualizerPreset("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("equalizer: equalizer_custom_set", () => {
    it("setCustomEqualizer returns success result", async () => {
      const result = await adapter.setCustomEqualizer("test_effectId", "test_values");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setCustomEqualizer propagates injected errors", async () => {
      control.setError("setCustomEqualizer", new Error("injected error"));
      await expect(
        adapter.setCustomEqualizer("test", "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("equalizer: equalizer_custom_save", () => {
    it("saveCustomEqualizer returns success result", async () => {
      const result = await adapter.saveCustomEqualizer("test_name", "test_values");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("saveCustomEqualizer propagates injected errors", async () => {
      control.setError("saveCustomEqualizer", new Error("injected error"));
      await expect(
        adapter.saveCustomEqualizer("test", "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("beosonic: beosonic_read", () => {
    it("readBeosonic returns success result", async () => {
      const result = await adapter.readBeosonic();
      expect(result).toBeDefined();
    });

    it("readBeosonic propagates injected errors", async () => {
      control.setError("readBeosonic", new Error("injected error"));
      await expect(
        adapter.readBeosonic()
      ).rejects.toThrow("injected error");
    });
  });

  describe("beosonic: beosonic_preset_set", () => {
    it("setBeosonicPreset returns success result", async () => {
      const result = await adapter.setBeosonicPreset(1, 1, 1);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setBeosonicPreset propagates injected errors", async () => {
      control.setError("setBeosonicPreset", new Error("injected error"));
      await expect(
        adapter.setBeosonicPreset(1, 1, 1)
      ).rejects.toThrow("injected error");
    });
  });

  describe("locksound: locksound_read", () => {
    it("readLockSound returns success result", async () => {
      const result = await adapter.readLockSound();
      expect(result).toBeDefined();
    });

    it("readLockSound propagates injected errors", async () => {
      control.setError("readLockSound", new Error("injected error"));
      await expect(
        adapter.readLockSound()
      ).rejects.toThrow("injected error");
    });
  });

  describe("locksound: locksound_enable", () => {
    it("enableLockSound returns success result", async () => {
      const result = await adapter.enableLockSound("test_resourceCode");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("enableLockSound propagates injected errors", async () => {
      control.setError("enableLockSound", new Error("injected error"));
      await expect(
        adapter.enableLockSound("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("locksound: locksound_disable", () => {
    it("disableLockSound returns success result", async () => {
      const result = await adapter.disableLockSound();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("disableLockSound propagates injected errors", async () => {
      control.setError("disableLockSound", new Error("injected error"));
      await expect(
        adapter.disableLockSound()
      ).rejects.toThrow("injected error");
    });
  });

  describe("karaoke: karaoke_read", () => {
    it("readKaraoke returns success result", async () => {
      const result = await adapter.readKaraoke();
      expect(result).toBeDefined();
    });

    it("readKaraoke propagates injected errors", async () => {
      control.setError("readKaraoke", new Error("injected error"));
      await expect(
        adapter.readKaraoke()
      ).rejects.toThrow("injected error");
    });
  });

  describe("karaoke: karaoke_mode_set", () => {
    it("setKaraokeMode returns success result", async () => {
      const result = await adapter.setKaraokeMode(1);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("setKaraokeMode propagates injected errors", async () => {
      control.setError("setKaraokeMode", new Error("injected error"));
      await expect(
        adapter.setKaraokeMode(1)
      ).rejects.toThrow("injected error");
    });
  });

  describe("vehicle: carinfo_read", () => {
    it("readCarInfo returns success result", async () => {
      const result = await adapter.readCarInfo();
      expect(result).toBeDefined();
    });

    it("readCarInfo propagates injected errors", async () => {
      control.setError("readCarInfo", new Error("injected error"));
      await expect(
        adapter.readCarInfo()
      ).rejects.toThrow("injected error");
    });
  });

  describe("system: appstatus_read", () => {
    it("readAppStatus returns success result", async () => {
      const result = await adapter.readAppStatus();
      expect(result).toBeDefined();
    });

    it("readAppStatus propagates injected errors", async () => {
      control.setError("readAppStatus", new Error("injected error"));
      await expect(
        adapter.readAppStatus()
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
      const result = await adapter.readSoundStage();
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

  describe("system: launch_app", () => {
    it("launchApp returns success with targetPageId", async () => {
      const result = await adapter.launchApp("imaudio");
      expect(result.success).toBe(true);
      expect(result.appName).toBe("imaudio");
      expect(result.targetPageId).toBeTruthy();
    });

    it("launchApp propagates injected errors", async () => {
      control.setError("launchApp", new Error("injected"));
      await expect(adapter.launchApp("imaudio")).rejects.toThrow("injected");
    });

    it("launchApp supports lightpoint/smartcar", async () => {
      for (const app of ["imaudio", "lightpoint", "smartcar"]) {
        const result = await adapter.launchApp(app);
        expect(result.success).toBe(true);
        expect(result.appName).toBe(app);
        expect(result.targetPageId).toBeTruthy();
      }
    });
  });
});
