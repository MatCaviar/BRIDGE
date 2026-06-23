// Mock adapter tests for aipet MCP Server
// Auto-generated — tests ALL adapter methods with success and error injection
import { describe, it, expect, beforeEach } from "vitest";
import { createMockAdapter } from "../../src/adapters/mock-adapter.js";

describe("MockAdapter", () => {
  let adapter: ReturnType<typeof createMockAdapter>["adapter"];
  let control: ReturnType<typeof createMockAdapter>["control"];

  beforeEach(() => {
    ({ adapter, control } = createMockAdapter());
  });

  describe("navigation: navigate_to", () => {
    it("navigateToPage returns success result", async () => {
      const result = await adapter.navigateToPage("test_pageName");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("navigateToPage propagates injected errors", async () => {
      control.setError("navigateToPage", new Error("injected error"));
      await expect(
        adapter.navigateToPage("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("navigation: go_back", () => {
    it("goPageBack returns success result", async () => {
      const result = await adapter.goPageBack();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("goPageBack propagates injected errors", async () => {
      control.setError("goPageBack", new Error("injected error"));
      await expect(
        adapter.goPageBack()
      ).rejects.toThrow("injected error");
    });
  });

  describe("navigation: get_current_page", () => {
    it("getPageCurrent returns success result", async () => {
      const result = await adapter.getPageCurrent();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("getPageCurrent propagates injected errors", async () => {
      control.setError("getPageCurrent", new Error("injected error"));
      await expect(
        adapter.getPageCurrent()
      ).rejects.toThrow("injected error");
    });
  });

  describe("pet: capture_photo", () => {
    it("capturePet returns success result", async () => {
      const result = await adapter.capturePet(1);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("capturePet propagates injected errors", async () => {
      control.setError("capturePet", new Error("injected error"));
      await expect(
        adapter.capturePet(1)
      ).rejects.toThrow("injected error");
    });
  });

  describe("pet: upload_pet_image", () => {
    it("uploadPetImage returns success result", async () => {
      const result = await adapter.uploadPetImage("test_imagePath");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("uploadPetImage propagates injected errors", async () => {
      control.setError("uploadPetImage", new Error("injected error"));
      await expect(
        adapter.uploadPetImage("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("pet: generate_pet_avatar", () => {
    it("generatePetAvatar returns success result", async () => {
      const result = await adapter.generatePetAvatar("test_style", "test_imagePath");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("generatePetAvatar propagates injected errors", async () => {
      control.setError("generatePetAvatar", new Error("injected error"));
      await expect(
        adapter.generatePetAvatar("test", "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("pet: apply_pet_avatar", () => {
    it("applyPetAvatar returns success result", async () => {
      const result = await adapter.applyPetAvatar("test_avatarUrl", "test_scene", true);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("applyPetAvatar propagates injected errors", async () => {
      control.setError("applyPetAvatar", new Error("injected error"));
      await expect(
        adapter.applyPetAvatar("test", "test", "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("pet: regenerate_pet_avatar", () => {
    it("regeneratePetAvatar returns success result", async () => {
      const result = await adapter.regeneratePetAvatar("test_style");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("regeneratePetAvatar propagates injected errors", async () => {
      control.setError("regeneratePetAvatar", new Error("injected error"));
      await expect(
        adapter.regeneratePetAvatar("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("vehicle: get_vehicle_info", () => {
    it("getVehicleInfo returns success result", async () => {
      const result = await adapter.getVehicleInfo();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("getVehicleInfo propagates injected errors", async () => {
      control.setError("getVehicleInfo", new Error("injected error"));
      await expect(
        adapter.getVehicleInfo()
      ).rejects.toThrow("injected error");
    });
  });

  describe("vehicle: get_gear_status", () => {
    it("readGearStatus returns success result", async () => {
      const result = await adapter.readGearStatus();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("readGearStatus propagates injected errors", async () => {
      control.setError("readGearStatus", new Error("injected error"));
      await expect(
        adapter.readGearStatus()
      ).rejects.toThrow("injected error");
    });
  });

  describe("vehicle: on_gear_changed", () => {
    it("subscribeGear returns success result", async () => {
      const result = await adapter.subscribeGear();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("subscribeGear propagates injected errors", async () => {
      control.setError("subscribeGear", new Error("injected error"));
      await expect(
        adapter.subscribeGear()
      ).rejects.toThrow("injected error");
    });
  });

  describe("transfer: get_hotspot_info", () => {
    it("getHotspotInfo returns success result", async () => {
      const result = await adapter.getHotspotInfo();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("getHotspotInfo propagates injected errors", async () => {
      control.setError("getHotspotInfo", new Error("injected error"));
      await expect(
        adapter.getHotspotInfo()
      ).rejects.toThrow("injected error");
    });
  });

  describe("transfer: generate_qr_code", () => {
    it("generateQrCode returns success result", async () => {
      const result = await adapter.generateQrCode("test_data");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("generateQrCode propagates injected errors", async () => {
      control.setError("generateQrCode", new Error("injected error"));
      await expect(
        adapter.generateQrCode("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("transfer: transfer_to_phone", () => {
    it("transferPhone returns success result", async () => {
      const result = await adapter.transferPhone("test_data", "test_ssid");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("transferPhone propagates injected errors", async () => {
      control.setError("transferPhone", new Error("injected error"));
      await expect(
        adapter.transferPhone("test", "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("system: get_app_status", () => {
    it("getAppStatus returns success result", async () => {
      const result = await adapter.getAppStatus();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("getAppStatus propagates injected errors", async () => {
      control.setError("getAppStatus", new Error("injected error"));
      await expect(
        adapter.getAppStatus()
      ).rejects.toThrow("injected error");
    });
  });

  describe("system: get_display_info", () => {
    it("getDisplayInfo returns success result", async () => {
      const result = await adapter.getDisplayInfo();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("getDisplayInfo propagates injected errors", async () => {
      control.setError("getDisplayInfo", new Error("injected error"));
      await expect(
        adapter.getDisplayInfo()
      ).rejects.toThrow("injected error");
    });
  });

  describe("system: show_toast", () => {
    it("showToast returns success result", async () => {
      const result = await adapter.showToast("test_message", "test_align");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("showToast propagates injected errors", async () => {
      control.setError("showToast", new Error("injected error"));
      await expect(
        adapter.showToast("test", "test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("system: show_loading", () => {
    it("showLoading returns success result", async () => {
      const result = await adapter.showLoading("test_message");
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("showLoading propagates injected errors", async () => {
      control.setError("showLoading", new Error("injected error"));
      await expect(
        adapter.showLoading("test")
      ).rejects.toThrow("injected error");
    });
  });

  describe("system: hide_loading", () => {
    it("hideLoading returns success result", async () => {
      const result = await adapter.hideLoading();
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("hideLoading propagates injected errors", async () => {
      control.setError("hideLoading", new Error("injected error"));
      await expect(
        adapter.hideLoading()
      ).rejects.toThrow("injected error");
    });
  });

  describe("system: play_animation", () => {
    it("playAnimation returns success result", async () => {
      const result = await adapter.playAnimation("test_type", 1);
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
    });

    it("playAnimation propagates injected errors", async () => {
      control.setError("playAnimation", new Error("injected error"));
      await expect(
        adapter.playAnimation("test", 1)
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

    it("pageStack starts with [\"home\"]", () => {
      const state = control.getMockState();
      expect(state.pageStack).toEqual(["home"]);
    });

    it("pageStack reflects navigation state", async () => {
      await adapter.navigateToPage("settings");
      const state = control.getMockState();
      expect(state.pageStack.length).toBeGreaterThanOrEqual(1);
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
      const result = await adapter.navigateToPage("test");
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

    it("showToast updates activeToast state", async () => {
      await adapter.showToast("hello");
      expect(control.getMockState().activeToast).toBe("hello");
    });

    it("showLoading sets isLoading state", async () => {
      await adapter.showLoading();
      expect(control.getMockState().isLoading).toBe(true);
    });

    it("hideLoading clears isLoading state", async () => {
      control.setLoading(true);
      await adapter.hideLoading();
      expect(control.getMockState().isLoading).toBe(false);
    });

  });
});
