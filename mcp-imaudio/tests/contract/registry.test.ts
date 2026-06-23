// Contract tests for imaudio MCP Server
// Auto-generated — validates generated code matches analysis.json
import { describe, it, expect } from "vitest";
import { TOOL_REGISTRY, safetyToAnnotations, getToolMeta, getToolsByDomain, getToolsByCategory, TOOL_COUNT } from "../../src/tools/registry.js";

describe("TOOL_REGISTRY contract", () => {
  it("contains all 17 capabilities from analysis.json", () => {
    expect(TOOL_REGISTRY).toHaveLength(17);
  });

  it("soundstage_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "soundstage_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("soundstage");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("sound_stage");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["SoundStageManager.getSoundStage"]);
  });

  it("soundstage_set exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "soundstage_set");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("soundstage");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("sound_stage");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["SoundStageManager.setSoundStage"]);
  });

  it("vnc_status_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "vnc_status_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("soundstage");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("vnc_status");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["SoundStageManager.getSpeedVolumeStatus"]);
  });

  it("vnc_status_set exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "vnc_status_set");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("soundstage");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("vnc_status");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["SoundStageManager.setSpeedVolumeStatus"]);
  });

  it("equalizer_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("equalizer");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("equalizer");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["EqualizerModel.getEffectValues"]);
  });

  it("equalizer_preset_set exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_preset_set");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("equalizer");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("equalizer_preset");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["EqualizerModel.sendEffectValues"]);
  });

  it("equalizer_custom_set exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_custom_set");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("equalizer");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("custom_equalizer");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["EqualizerModel.sendEffectValues"]);
  });

  it("equalizer_custom_save exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_custom_save");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("equalizer");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("custom_equalizer");
    expect(entry!.action).toBe("save");
    expect(entry!.sdkCalls).toEqual(["EqualizerModel.createAndSaveEffect"]);
  });

  it("beosonic_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "beosonic_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("beosonic");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("beosonic");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["BeosonicModel.getCurrentValues"]);
  });

  it("beosonic_preset_set exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "beosonic_preset_set");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("beosonic");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("beosonic_preset");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["BeosonicModel.sendEffectValues"]);
  });

  it("locksound_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "locksound_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("locksound");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("lock_sound");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["LockSoundModel.getEffectValues"]);
  });

  it("locksound_enable exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "locksound_enable");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("locksound");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("lock_sound");
    expect(entry!.action).toBe("enable");
    expect(entry!.sdkCalls).toEqual(["LockSoundModel.sendEffectValues"]);
  });

  it("locksound_disable exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "locksound_disable");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("locksound");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("lock_sound");
    expect(entry!.action).toBe("disable");
    expect(entry!.sdkCalls).toEqual(["LockSoundModel.disableLockSound"]);
  });

  it("karaoke_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "karaoke_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("karaoke");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("karaoke");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["KaraokeModel.getFastAudioMode"]);
  });

  it("karaoke_mode_set exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "karaoke_mode_set");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("karaoke");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("karaoke_mode");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["KaraokeManager.setFastAudioMode"]);
  });

  it("carinfo_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "carinfo_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("vehicle");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("car_info");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["CarInfoModel.getVin"]);
  });

  it("appstatus_read exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "appstatus_read");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("system");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("app_status");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["WindowManager.isPageActive"]);
  });

  it("has unique tool IDs", () => {
    const ids = TOOL_REGISTRY.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("description consistency", () => {
    it("soundstage_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "soundstage_read");
      expect(entry).toBeDefined();
      const expected = `read sound_stage`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("soundstage_set description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "soundstage_set");
      expect(entry).toBeDefined();
      const expected = `set sound_stage`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("vnc_status_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "vnc_status_read");
      expect(entry).toBeDefined();
      const expected = `read vnc_status`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("vnc_status_set description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "vnc_status_set");
      expect(entry).toBeDefined();
      const expected = `set vnc_status`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("equalizer_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_read");
      expect(entry).toBeDefined();
      const expected = `read equalizer`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("equalizer_preset_set description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_preset_set");
      expect(entry).toBeDefined();
      const expected = `set equalizer_preset`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("equalizer_custom_set description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_custom_set");
      expect(entry).toBeDefined();
      const expected = `set custom_equalizer`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("equalizer_custom_save description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "equalizer_custom_save");
      expect(entry).toBeDefined();
      const expected = `save custom_equalizer`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("beosonic_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "beosonic_read");
      expect(entry).toBeDefined();
      const expected = `read beosonic`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("beosonic_preset_set description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "beosonic_preset_set");
      expect(entry).toBeDefined();
      const expected = `set beosonic_preset`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("locksound_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "locksound_read");
      expect(entry).toBeDefined();
      const expected = `read lock_sound`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("locksound_enable description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "locksound_enable");
      expect(entry).toBeDefined();
      const expected = `enable lock_sound`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("locksound_disable description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "locksound_disable");
      expect(entry).toBeDefined();
      const expected = `disable lock_sound`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("karaoke_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "karaoke_read");
      expect(entry).toBeDefined();
      const expected = `read karaoke`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("karaoke_mode_set description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "karaoke_mode_set");
      expect(entry).toBeDefined();
      const expected = `set karaoke_mode`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("carinfo_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "carinfo_read");
      expect(entry).toBeDefined();
      const expected = `read car_info`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("appstatus_read description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "appstatus_read");
      expect(entry).toBeDefined();
      const expected = `read app_status`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
  });

  describe("safety level mapping", () => {
    const validLevels = new Set(["readonly","normal","p_gear_required","p_gear_and_confirm","p_gear_and_network"]);
    it("every entry has a valid safety level", () => {
      for (const entry of TOOL_REGISTRY) {
        expect(validLevels.has(entry.safetyLevel)).toBe(true);
      }
    });
    it("readonly capabilities are correctly classified", () => {
      const expected = ["soundstage_read","vnc_status_read","equalizer_read","beosonic_read","locksound_read","karaoke_read","carinfo_read","appstatus_read"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "readonly")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("normal capabilities are correctly classified", () => {
      const expected = ["soundstage_set","vnc_status_set","equalizer_preset_set","equalizer_custom_set","equalizer_custom_save","beosonic_preset_set","locksound_enable","locksound_disable","karaoke_mode_set"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "normal")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
  });

  describe("domain groupings", () => {
    it("soundstage domain covers all 4 capabilities", () => {
      const expected = ["soundstage_read","soundstage_set","vnc_status_read","vnc_status_set"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "soundstage")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("equalizer domain covers all 4 capabilities", () => {
      const expected = ["equalizer_read","equalizer_preset_set","equalizer_custom_set","equalizer_custom_save"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "equalizer")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("beosonic domain covers all 2 capabilities", () => {
      const expected = ["beosonic_read","beosonic_preset_set"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "beosonic")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("locksound domain covers all 3 capabilities", () => {
      const expected = ["locksound_read","locksound_enable","locksound_disable"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "locksound")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("karaoke domain covers all 2 capabilities", () => {
      const expected = ["karaoke_read","karaoke_mode_set"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "karaoke")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("vehicle domain covers all 1 capabilities", () => {
      const expected = ["carinfo_read"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "vehicle")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("system domain covers all 1 capabilities", () => {
      const expected = ["appstatus_read"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "system")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("every registry entry belongs to a known domain", () => {
      const knownDomains = new Set(["soundstage","equalizer","beosonic","locksound","karaoke","vehicle","system"]);
      for (const entry of TOOL_REGISTRY) {
        expect(knownDomains.has(entry.domain)).toBe(true);
      }
    });
  });
});

describe("safetyToAnnotations", () => {
  it("readonly → readOnlyHint + idempotentHint", () => {
    const a = safetyToAnnotations("readonly");
    expect(a.readOnlyHint).toBe(true);
    expect(a.idempotentHint).toBe(true);
    expect(a.destructiveHint).toBeUndefined();
    expect(a.openWorldHint).toBeUndefined();
  });

  it("normal → no hints", () => {
    const a = safetyToAnnotations("normal");
    expect(a.readOnlyHint).toBeUndefined();
    expect(a.destructiveHint).toBeUndefined();
    expect(a.idempotentHint).toBeUndefined();
    expect(a.openWorldHint).toBeUndefined();
  });

  it("p_gear_required → destructiveHint", () => {
    const a = safetyToAnnotations("p_gear_required");
    expect(a.destructiveHint).toBe(true);
    expect(a.readOnlyHint).toBeUndefined();
  });

  it("p_gear_and_confirm → destructiveHint", () => {
    const a = safetyToAnnotations("p_gear_and_confirm");
    expect(a.destructiveHint).toBe(true);
  });

  it("p_gear_and_network → destructiveHint + openWorldHint", () => {
    const a = safetyToAnnotations("p_gear_and_network");
    expect(a.openWorldHint).toBe(true);
    expect(a.destructiveHint).toBe(true);
  });
});

describe("TOOL_COUNT", () => {
  it("matches TOOL_REGISTRY length", () => {
    expect(TOOL_COUNT).toBe(TOOL_REGISTRY.length);
    expect(TOOL_COUNT).toBe(17);
  });
});

describe("getToolMeta", () => {
  it("returns entry for soundstage_read", () => {
    const meta = getToolMeta("soundstage_read");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("soundstage_read");
  });

  it("returns entry for soundstage_set", () => {
    const meta = getToolMeta("soundstage_set");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("soundstage_set");
  });

  it("returns entry for vnc_status_read", () => {
    const meta = getToolMeta("vnc_status_read");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("vnc_status_read");
  });

  it("returns undefined for unknown tool", () => {
    expect(getToolMeta("nonexistent_tool_xyz")).toBeUndefined();
  });
});

describe("getToolsByDomain", () => {
  it("soundstage domain returns 4 tools", () => {
    const tools = getToolsByDomain("soundstage");
    expect(tools).toHaveLength(4);
    expect(tools.every(t => t.domain === "soundstage")).toBe(true);
  });

  it("equalizer domain returns 4 tools", () => {
    const tools = getToolsByDomain("equalizer");
    expect(tools).toHaveLength(4);
    expect(tools.every(t => t.domain === "equalizer")).toBe(true);
  });

  it("beosonic domain returns 2 tools", () => {
    const tools = getToolsByDomain("beosonic");
    expect(tools).toHaveLength(2);
    expect(tools.every(t => t.domain === "beosonic")).toBe(true);
  });

  it("locksound domain returns 3 tools", () => {
    const tools = getToolsByDomain("locksound");
    expect(tools).toHaveLength(3);
    expect(tools.every(t => t.domain === "locksound")).toBe(true);
  });

  it("karaoke domain returns 2 tools", () => {
    const tools = getToolsByDomain("karaoke");
    expect(tools).toHaveLength(2);
    expect(tools.every(t => t.domain === "karaoke")).toBe(true);
  });

  it("vehicle domain returns 1 tools", () => {
    const tools = getToolsByDomain("vehicle");
    expect(tools).toHaveLength(1);
    expect(tools.every(t => t.domain === "vehicle")).toBe(true);
  });

  it("system domain returns 1 tools", () => {
    const tools = getToolsByDomain("system");
    expect(tools).toHaveLength(1);
    expect(tools.every(t => t.domain === "system")).toBe(true);
  });

  it("returns empty for unknown domain", () => {
    expect(getToolsByDomain("nonexistent_domain")).toHaveLength(0);
  });
});

describe("getToolsByCategory", () => {
  it("readonly category returns 8 tools", () => {
    const tools = getToolsByCategory("readonly");
    expect(tools).toHaveLength(8);
    expect(tools.every(t => t.safetyLevel === "readonly")).toBe(true);
  });

  it("normal category returns 9 tools", () => {
    const tools = getToolsByCategory("normal");
    expect(tools).toHaveLength(9);
    expect(tools.every(t => t.safetyLevel === "normal")).toBe(true);
  });

});

describe("annotation consistency", () => {
  for (const entry of TOOL_REGISTRY) {
    it(`${entry.id} annotations match safety level ${entry.safetyLevel}`, () => {
      const annotations = safetyToAnnotations(entry.safetyLevel);
      if (entry.safetyLevel === "readonly") {
        expect(annotations.readOnlyHint).toBe(true);
        expect(annotations.idempotentHint).toBe(true);
      }
      if (entry.safetyLevel === "normal") {
        expect(Object.keys(annotations)).toHaveLength(0);
      }
      if (entry.safetyLevel === "p_gear_required" || entry.safetyLevel === "p_gear_and_confirm" || entry.safetyLevel === "p_gear_and_network") {
        expect(annotations.destructiveHint).toBe(true);
      }
      if (entry.safetyLevel === "p_gear_and_network") {
        expect(annotations.openWorldHint).toBe(true);
      }
    });
  }
});

