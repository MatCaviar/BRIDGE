import { describe, it, expect } from "vitest";
import { createGearReader, createVinReader, createGearSubscriber } from "../commons/src/vehicle.js";
import { createNavigationOps, createCrossScreenOps } from "../commons/src/navigation.js";
import { createDisplayOps } from "../commons/src/display.js";
import { createSystemOps } from "../commons/src/system.js";
import { createToastOps } from "../commons/src/toast.js";
import { createLoadingOps } from "../commons/src/loading.js";

describe("vehicle commons", () => {
  it("createGearReader returns safe default", () => {
    const readGear = createGearReader(() => "false");
    const status = readGear();
    expect(status.isParked).toBe(true);
    expect(status.ignoreMode).toBe(false);
  });

  it("createGearReader detects ignoreMode", () => {
    const readGear = createGearReader((key) => key === "persist.sys.pr.igonreMode" ? "true" : "");
    const status = readGear();
    expect(status.ignoreMode).toBe(true);
  });

  it("createVinReader reads VIN from sysprop", () => {
    const readVin = createVinReader(() => "WBA12345678");
    const info = readVin();
    expect(info.vin).toBe("WBA12345678");
  });

  it("createVinReader returns UNKNOWN when sysprop empty", () => {
    const readVin = createVinReader(() => "");
    const info = readVin();
    expect(info.vin).toBe("UNKNOWN");
  });

  it("createGearSubscriber wraps subscription", () => {
    let subscribed = false;
    const subscribe = createGearSubscriber((_id, _cb) => { subscribed = true; });
    subscribe(() => {});
    expect(subscribed).toBe(true);
  });
});

describe("navigation commons", () => {
  it("navigateTo calls router.navigate and returns state", async () => {
    const navigated: string[] = [];
    const ops = createNavigationOps({
      navigate: async (name) => { navigated.push(name); },
      back: async () => {},
      getLength: () => 2,
    });

    const state = await ops.navigateTo("settings");
    expect(state.currentPage).toBe("settings");
    expect(state.stackDepth).toBe(2);
    expect(navigated).toEqual(["settings"]);
  });

  it("goBack calls router.back", async () => {
    const backed = { count: 0 };
    const ops = createNavigationOps({
      navigate: async () => {},
      back: async () => { backed.count++; },
      getLength: () => 1,
    });

    await ops.goBack();
    expect(backed.count).toBe(1);
  });
});

describe("display commons", () => {
  it("returns screen dimensions", () => {
    const ops = createDisplayOps({ width: 1920, height: 720 }, () => "");
    const info = ops.getScreenInfo();
    expect(info.width).toBe(1920);
    expect(info.height).toBe(720);
  });

  it("detects dual screen by aspect ratio", () => {
    const ops = createDisplayOps({ width: 2560, height: 720 }, () => "");
    expect(ops.getScreenInfo().isDualScreen).toBe(true);
  });

  it("reads theme style from sysprop", () => {
    const ops = createDisplayOps({ width: 1920, height: 720 }, (k) => k === "persist.sys.ui.themeStyle" ? "dark" : "");
    expect(ops.getThemeInfo().style).toBe("dark");
  });
});

describe("system commons", () => {
  it("returns system info from sysprop", () => {
    const ops = createSystemOps((key) => {
      if (key === "persist.sys.ui.themeStyle") return "light";
      if (key === "persist.sys.pr.igonreMode") return "1";
      return "";
    });
    const info = ops.getSystemInfo();
    expect(info.themeStyle).toBe("light");
    expect(info.ignoreMode).toBe(true);
  });
});

describe("toast commons", () => {
  it("calls showToast with text and duration", () => {
    const calls: Array<{ text: string; duration: number }> = [];
    const ops = createToastOps((text, duration) => { calls.push({ text, duration }); });
    ops.show("Hello");
    expect(calls).toEqual([{ text: "Hello", duration: 2000 }]);
  });

  it("throws on empty text", () => {
    const ops = createToastOps(() => {});
    expect(() => ops.show("")).toThrow("must not be empty");
  });
});

describe("loading commons", () => {
  it("show and hide track visibility", () => {
    let visible = false;
    const ops = createLoadingOps(
      () => { visible = true; },
      () => { visible = false; },
    );
    ops.show("Loading...");
    expect(visible).toBe(true);
    ops.hide();
    expect(visible).toBe(false);
  });

  it("show is idempotent", () => {
    let showCount = 0;
    const ops = createLoadingOps(() => { showCount++; }, () => {});
    ops.show("A");
    ops.show("B");
    expect(showCount).toBe(1);
  });

  it("hide is idempotent", () => {
    let hideCount = 0;
    const ops = createLoadingOps(() => {}, () => { hideCount++; });
    ops.hide();
    ops.hide();
    expect(hideCount).toBe(0);
  });
});
