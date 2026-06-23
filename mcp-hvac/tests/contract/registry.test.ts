// Contract tests for hvac MCP Server
// Auto-generated — validates generated code matches analysis.json
import { describe, it, expect } from "vitest";
import { TOOL_REGISTRY, safetyToAnnotations, getToolMeta, getToolsByDomain, getToolsByCategory, TOOL_COUNT } from "../../src/tools/registry.js";

describe("TOOL_REGISTRY contract", () => {
  it("contains all 9 capabilities from analysis.json", () => {
    expect(TOOL_REGISTRY).toHaveLength(9);
  });

  it("set_temperature exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "set_temperature");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("climate");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("temperature");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["@system.hvac"]);
  });

  it("set_fan_speed exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "set_fan_speed");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("climate");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("fan");
    expect(entry!.action).toBe("set_speed");
    expect(entry!.sdkCalls).toEqual(["@system.hvac"]);
  });

  it("toggle_ac exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "toggle_ac");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("climate");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("ac");
    expect(entry!.action).toBe("toggle");
    expect(entry!.sdkCalls).toEqual(["@system.hvac"]);
  });

  it("read_cabin_temperature exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "read_cabin_temperature");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("climate");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("cabin");
    expect(entry!.action).toBe("read_temperature");
    expect(entry!.sdkCalls).toEqual(["@system.sensor"]);
  });

  it("defrost_front exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "defrost_front");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("climate");
    expect(entry!.safetyLevel).toBe("p_gear_required");
    expect(entry!.object).toBe("windshield");
    expect(entry!.action).toBe("defrost");
    expect(entry!.sdkCalls).toEqual(["@system.hvac"]);
  });

  it("open_window exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "open_window");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("window");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("window");
    expect(entry!.action).toBe("open");
    expect(entry!.sdkCalls).toEqual(["@system.window"]);
  });

  it("close_window exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "close_window");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("window");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("window");
    expect(entry!.action).toBe("close");
    expect(entry!.sdkCalls).toEqual(["@system.window"]);
  });

  it("read_air_quality exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "read_air_quality");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("sensor");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("aqi");
    expect(entry!.action).toBe("read");
    expect(entry!.sdkCalls).toEqual(["@system.sensor"]);
  });

  it("set_seat_ventilation exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "set_seat_ventilation");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("seat");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("ventilation");
    expect(entry!.action).toBe("set");
    expect(entry!.sdkCalls).toEqual(["@system.seat"]);
  });

  it("has unique tool IDs", () => {
    const ids = TOOL_REGISTRY.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("description consistency", () => {
    it("set_temperature description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "set_temperature");
      expect(entry).toBeDefined();
      const expected = `set temperature`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("set_fan_speed description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "set_fan_speed");
      expect(entry).toBeDefined();
      const expected = `set_speed fan`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("toggle_ac description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "toggle_ac");
      expect(entry).toBeDefined();
      const expected = `toggle ac`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("read_cabin_temperature description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "read_cabin_temperature");
      expect(entry).toBeDefined();
      const expected = `read_temperature cabin`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("defrost_front description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "defrost_front");
      expect(entry).toBeDefined();
      const expected = `defrost windshield`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("open_window description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "open_window");
      expect(entry).toBeDefined();
      const expected = `open window`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("close_window description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "close_window");
      expect(entry).toBeDefined();
      const expected = `close window`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("read_air_quality description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "read_air_quality");
      expect(entry).toBeDefined();
      const expected = `read aqi`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("set_seat_ventilation description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "set_seat_ventilation");
      expect(entry).toBeDefined();
      const expected = `set ventilation`;
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
    it("normal capabilities are correctly classified", () => {
      const expected = ["set_temperature","set_fan_speed","toggle_ac","open_window","close_window","set_seat_ventilation"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "normal")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("readonly capabilities are correctly classified", () => {
      const expected = ["read_cabin_temperature","read_air_quality"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "readonly")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("p_gear_required capabilities are correctly classified", () => {
      const expected = ["defrost_front"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "p_gear_required")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
  });

  describe("domain groupings", () => {
    it("climate domain covers all 5 capabilities", () => {
      const expected = ["set_temperature","set_fan_speed","toggle_ac","read_cabin_temperature","defrost_front"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "climate")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("window domain covers all 2 capabilities", () => {
      const expected = ["open_window","close_window"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "window")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("sensor domain covers all 1 capabilities", () => {
      const expected = ["read_air_quality"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "sensor")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("seat domain covers all 1 capabilities", () => {
      const expected = ["set_seat_ventilation"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "seat")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("every registry entry belongs to a known domain", () => {
      const knownDomains = new Set(["climate","window","sensor","seat"]);
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
    expect(TOOL_COUNT).toBe(9);
  });
});

describe("getToolMeta", () => {
  it("returns entry for set_temperature", () => {
    const meta = getToolMeta("set_temperature");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("set_temperature");
  });

  it("returns entry for set_fan_speed", () => {
    const meta = getToolMeta("set_fan_speed");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("set_fan_speed");
  });

  it("returns entry for toggle_ac", () => {
    const meta = getToolMeta("toggle_ac");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("toggle_ac");
  });

  it("returns undefined for unknown tool", () => {
    expect(getToolMeta("nonexistent_tool_xyz")).toBeUndefined();
  });
});

describe("getToolsByDomain", () => {
  it("climate domain returns 5 tools", () => {
    const tools = getToolsByDomain("climate");
    expect(tools).toHaveLength(5);
    expect(tools.every(t => t.domain === "climate")).toBe(true);
  });

  it("window domain returns 2 tools", () => {
    const tools = getToolsByDomain("window");
    expect(tools).toHaveLength(2);
    expect(tools.every(t => t.domain === "window")).toBe(true);
  });

  it("sensor domain returns 1 tools", () => {
    const tools = getToolsByDomain("sensor");
    expect(tools).toHaveLength(1);
    expect(tools.every(t => t.domain === "sensor")).toBe(true);
  });

  it("seat domain returns 1 tools", () => {
    const tools = getToolsByDomain("seat");
    expect(tools).toHaveLength(1);
    expect(tools.every(t => t.domain === "seat")).toBe(true);
  });

  it("returns empty for unknown domain", () => {
    expect(getToolsByDomain("nonexistent_domain")).toHaveLength(0);
  });
});

describe("getToolsByCategory", () => {
  it("normal category returns 6 tools", () => {
    const tools = getToolsByCategory("normal");
    expect(tools).toHaveLength(6);
    expect(tools.every(t => t.safetyLevel === "normal")).toBe(true);
  });

  it("readonly category returns 2 tools", () => {
    const tools = getToolsByCategory("readonly");
    expect(tools).toHaveLength(2);
    expect(tools.every(t => t.safetyLevel === "readonly")).toBe(true);
  });

  it("p_gear_required category returns 1 tools", () => {
    const tools = getToolsByCategory("p_gear_required");
    expect(tools).toHaveLength(1);
    expect(tools.every(t => t.safetyLevel === "p_gear_required")).toBe(true);
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

