// Contract tests for aipet MCP Server
// Auto-generated — validates generated code matches analysis.json
import { describe, it, expect } from "vitest";
import { TOOL_REGISTRY, safetyToAnnotations, getToolMeta, getToolsByDomain, getToolsByCategory, TOOL_COUNT } from "../../src/tools/registry.js";

describe("TOOL_REGISTRY contract", () => {
  it("contains all 20 capabilities from analysis.json", () => {
    expect(TOOL_REGISTRY).toHaveLength(20);
  });

  it("navigate_to exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "navigate_to");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("navigation");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("page");
    expect(entry!.action).toBe("navigate_to");
    expect(entry!.sdkCalls).toEqual(["yunos/appmodel/StackRouter"]);
  });

  it("go_back exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "go_back");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("navigation");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("page");
    expect(entry!.action).toBe("go_back");
    expect(entry!.sdkCalls).toEqual(["yunos/appmodel/StackRouter"]);
  });

  it("get_current_page exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "get_current_page");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("navigation");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("page");
    expect(entry!.action).toBe("get_current");
    expect(entry!.sdkCalls).toEqual(["yunos/appmodel/StackRouter"]);
  });

  it("capture_photo exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "capture_photo");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("pet");
    expect(entry!.safetyLevel).toBe("p_gear_required");
    expect(entry!.object).toBe("pet");
    expect(entry!.action).toBe("capture");
    expect(entry!.sdkCalls).toEqual(["IMCameraProxy.executeCmd"]);
  });

  it("upload_pet_image exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "upload_pet_image");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("pet");
    expect(entry!.safetyLevel).toBe("p_gear_required");
    expect(entry!.object).toBe("pet_image");
    expect(entry!.action).toBe("upload");
    expect(entry!.sdkCalls).toEqual(["yunos/net/HttpClient"]);
  });

  it("generate_pet_avatar exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "generate_pet_avatar");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("pet");
    expect(entry!.safetyLevel).toBe("p_gear_required");
    expect(entry!.object).toBe("pet_avatar");
    expect(entry!.action).toBe("generate");
    expect(entry!.sdkCalls).toEqual(["yunos/net/HttpClient"]);
  });

  it("apply_pet_avatar exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "apply_pet_avatar");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("pet");
    expect(entry!.safetyLevel).toBe("p_gear_and_confirm");
    expect(entry!.object).toBe("pet_avatar");
    expect(entry!.action).toBe("apply");
    expect(entry!.sdkCalls).toEqual(["@banma/hdt-types"]);
  });

  it("regenerate_pet_avatar exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "regenerate_pet_avatar");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("pet");
    expect(entry!.safetyLevel).toBe("p_gear_required");
    expect(entry!.object).toBe("pet_avatar");
    expect(entry!.action).toBe("regenerate");
    expect(entry!.sdkCalls).toEqual(["yunos/net/HttpClient"]);
  });

  it("get_vehicle_info exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "get_vehicle_info");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("vehicle");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("vehicle");
    expect(entry!.action).toBe("get_info");
    expect(entry!.sdkCalls).toEqual(["sysprop/sysprop"]);
  });

  it("get_gear_status exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "get_gear_status");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("vehicle");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("gear");
    expect(entry!.action).toBe("read_status");
    expect(entry!.sdkCalls).toEqual(["yunos/platform/auto/carservice/CarPropertyManager"]);
  });

  it("on_gear_changed exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "on_gear_changed");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("vehicle");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("gear");
    expect(entry!.action).toBe("subscribe");
    expect(entry!.sdkCalls).toEqual(["yunos/platform/auto/carservice/CarPropertyManager"]);
  });

  it("get_hotspot_info exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "get_hotspot_info");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("transfer");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("hotspot");
    expect(entry!.action).toBe("get_info");
    expect(entry!.sdkCalls).toEqual(["yunos/net/HotspotManager"]);
  });

  it("generate_qr_code exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "generate_qr_code");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("transfer");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("qr_code");
    expect(entry!.action).toBe("generate");
    expect(entry!.sdkCalls).toEqual(["yunos/net/HttpClient"]);
  });

  it("transfer_to_phone exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "transfer_to_phone");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("transfer");
    expect(entry!.safetyLevel).toBe("p_gear_and_network");
    expect(entry!.object).toBe("phone");
    expect(entry!.action).toBe("transfer");
    expect(entry!.sdkCalls).toEqual(["yunos/net/HotspotManager", "yunos/net/HttpClient"]);
  });

  it("get_app_status exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "get_app_status");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("system");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("app");
    expect(entry!.action).toBe("get_status");
    expect(entry!.sdkCalls).toEqual(["extend/hdt/page/BMPage"]);
  });

  it("get_display_info exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "get_display_info");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("system");
    expect(entry!.safetyLevel).toBe("readonly");
    expect(entry!.object).toBe("display");
    expect(entry!.action).toBe("get_info");
    expect(entry!.sdkCalls).toEqual(["extend/hdt/page/BMPage"]);
  });

  it("show_toast exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "show_toast");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("system");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("toast");
    expect(entry!.action).toBe("show");
    expect(entry!.sdkCalls).toEqual(["yunos/ui/widget/Toast"]);
  });

  it("show_loading exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "show_loading");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("system");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("loading");
    expect(entry!.action).toBe("show");
    expect(entry!.sdkCalls).toEqual(["yunos/ui/animation/PropertyAnimation"]);
  });

  it("hide_loading exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "hide_loading");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("system");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("loading");
    expect(entry!.action).toBe("hide");
    expect(entry!.sdkCalls).toEqual(["yunos/ui/animation/PropertyAnimation"]);
  });

  it("play_animation exists in registry with correct metadata", () => {
    const entry = TOOL_REGISTRY.find(e => e.id === "play_animation");
    expect(entry).toBeDefined();
    expect(entry!.domain).toBe("system");
    expect(entry!.safetyLevel).toBe("normal");
    expect(entry!.object).toBe("animation");
    expect(entry!.action).toBe("play");
    expect(entry!.sdkCalls).toEqual(["yunos/ui/view/ImageView"]);
  });

  it("has unique tool IDs", () => {
    const ids = TOOL_REGISTRY.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("description consistency", () => {
    it("navigate_to description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "navigate_to");
      expect(entry).toBeDefined();
      const expected = `navigate_to page`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("go_back description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "go_back");
      expect(entry).toBeDefined();
      const expected = `go_back page`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("get_current_page description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "get_current_page");
      expect(entry).toBeDefined();
      const expected = `get_current page`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("capture_photo description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "capture_photo");
      expect(entry).toBeDefined();
      const expected = `capture pet`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("upload_pet_image description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "upload_pet_image");
      expect(entry).toBeDefined();
      const expected = `upload pet_image`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("generate_pet_avatar description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "generate_pet_avatar");
      expect(entry).toBeDefined();
      const expected = `generate pet_avatar`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("apply_pet_avatar description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "apply_pet_avatar");
      expect(entry).toBeDefined();
      const expected = `apply pet_avatar`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("regenerate_pet_avatar description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "regenerate_pet_avatar");
      expect(entry).toBeDefined();
      const expected = `regenerate pet_avatar`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("get_vehicle_info description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "get_vehicle_info");
      expect(entry).toBeDefined();
      const expected = `get_info vehicle`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("get_gear_status description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "get_gear_status");
      expect(entry).toBeDefined();
      const expected = `read_status gear`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("on_gear_changed description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "on_gear_changed");
      expect(entry).toBeDefined();
      const expected = `subscribe gear`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("get_hotspot_info description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "get_hotspot_info");
      expect(entry).toBeDefined();
      const expected = `get_info hotspot`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("generate_qr_code description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "generate_qr_code");
      expect(entry).toBeDefined();
      const expected = `generate qr_code`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("transfer_to_phone description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "transfer_to_phone");
      expect(entry).toBeDefined();
      const expected = `transfer phone`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("get_app_status description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "get_app_status");
      expect(entry).toBeDefined();
      const expected = `get_status app`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("get_display_info description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "get_display_info");
      expect(entry).toBeDefined();
      const expected = `get_info display`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("show_toast description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "show_toast");
      expect(entry).toBeDefined();
      const expected = `show toast`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("show_loading description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "show_loading");
      expect(entry).toBeDefined();
      const expected = `show loading`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("hide_loading description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "hide_loading");
      expect(entry).toBeDefined();
      const expected = `hide loading`;
      expect(`${entry!.action} ${entry!.object}`).toBe(expected);
    });
    it("play_animation description matches action and object from analysis.json", () => {
      const entry = TOOL_REGISTRY.find(e => e.id === "play_animation");
      expect(entry).toBeDefined();
      const expected = `play animation`;
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
      const expected = ["navigate_to","go_back","show_toast","show_loading","hide_loading","play_animation"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "normal")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("readonly capabilities are correctly classified", () => {
      const expected = ["get_current_page","get_vehicle_info","get_gear_status","on_gear_changed","get_hotspot_info","generate_qr_code","get_app_status","get_display_info"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "readonly")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("p_gear_required capabilities are correctly classified", () => {
      const expected = ["capture_photo","upload_pet_image","generate_pet_avatar","regenerate_pet_avatar"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "p_gear_required")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("p_gear_and_confirm capabilities are correctly classified", () => {
      const expected = ["apply_pet_avatar"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "p_gear_and_confirm")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("p_gear_and_network capabilities are correctly classified", () => {
      const expected = ["transfer_to_phone"];
      const actual = TOOL_REGISTRY
        .filter(e => e.safetyLevel === "p_gear_and_network")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
  });

  describe("domain groupings", () => {
    it("navigation domain covers all 3 capabilities", () => {
      const expected = ["navigate_to","go_back","get_current_page"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "navigation")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("pet domain covers all 5 capabilities", () => {
      const expected = ["capture_photo","upload_pet_image","generate_pet_avatar","apply_pet_avatar","regenerate_pet_avatar"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "pet")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("vehicle domain covers all 3 capabilities", () => {
      const expected = ["get_vehicle_info","get_gear_status","on_gear_changed"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "vehicle")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("transfer domain covers all 3 capabilities", () => {
      const expected = ["get_hotspot_info","generate_qr_code","transfer_to_phone"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "transfer")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("system domain covers all 6 capabilities", () => {
      const expected = ["get_app_status","get_display_info","show_toast","show_loading","hide_loading","play_animation"];
      const actual = TOOL_REGISTRY
        .filter(e => e.domain === "system")
        .map(e => e.id);
      expect(actual.sort()).toEqual(expected.sort());
    });
    it("every registry entry belongs to a known domain", () => {
      const knownDomains = new Set(["navigation","pet","vehicle","transfer","system"]);
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
    expect(TOOL_COUNT).toBe(20);
  });
});

describe("getToolMeta", () => {
  it("returns entry for navigate_to", () => {
    const meta = getToolMeta("navigate_to");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("navigate_to");
  });

  it("returns entry for go_back", () => {
    const meta = getToolMeta("go_back");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("go_back");
  });

  it("returns entry for get_current_page", () => {
    const meta = getToolMeta("get_current_page");
    expect(meta).toBeDefined();
    expect(meta!.id).toBe("get_current_page");
  });

  it("returns undefined for unknown tool", () => {
    expect(getToolMeta("nonexistent_tool_xyz")).toBeUndefined();
  });
});

describe("getToolsByDomain", () => {
  it("navigation domain returns 3 tools", () => {
    const tools = getToolsByDomain("navigation");
    expect(tools).toHaveLength(3);
    expect(tools.every(t => t.domain === "navigation")).toBe(true);
  });

  it("pet domain returns 5 tools", () => {
    const tools = getToolsByDomain("pet");
    expect(tools).toHaveLength(5);
    expect(tools.every(t => t.domain === "pet")).toBe(true);
  });

  it("vehicle domain returns 3 tools", () => {
    const tools = getToolsByDomain("vehicle");
    expect(tools).toHaveLength(3);
    expect(tools.every(t => t.domain === "vehicle")).toBe(true);
  });

  it("transfer domain returns 3 tools", () => {
    const tools = getToolsByDomain("transfer");
    expect(tools).toHaveLength(3);
    expect(tools.every(t => t.domain === "transfer")).toBe(true);
  });

  it("system domain returns 6 tools", () => {
    const tools = getToolsByDomain("system");
    expect(tools).toHaveLength(6);
    expect(tools.every(t => t.domain === "system")).toBe(true);
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

  it("readonly category returns 8 tools", () => {
    const tools = getToolsByCategory("readonly");
    expect(tools).toHaveLength(8);
    expect(tools.every(t => t.safetyLevel === "readonly")).toBe(true);
  });

  it("p_gear_required category returns 4 tools", () => {
    const tools = getToolsByCategory("p_gear_required");
    expect(tools).toHaveLength(4);
    expect(tools.every(t => t.safetyLevel === "p_gear_required")).toBe(true);
  });

  it("p_gear_and_confirm category returns 1 tools", () => {
    const tools = getToolsByCategory("p_gear_and_confirm");
    expect(tools).toHaveLength(1);
    expect(tools.every(t => t.safetyLevel === "p_gear_and_confirm")).toBe(true);
  });

  it("p_gear_and_network category returns 1 tools", () => {
    const tools = getToolsByCategory("p_gear_and_network");
    expect(tools).toHaveLength(1);
    expect(tools.every(t => t.safetyLevel === "p_gear_and_network")).toBe(true);
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

