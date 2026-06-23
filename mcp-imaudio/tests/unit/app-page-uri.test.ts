import { describe, it, expect } from "vitest";
import { APP_PAGE_URI, resolvePageUri } from "../../src/adapters/app-page-uri.js";

describe("APP_PAGE_URI", () => {
  it("contains imaudio/lightpoint/smartcar targets", () => {
    expect(APP_PAGE_URI.imaudio).toBe("page://imaudio.yunos.com/imaudio");
    expect(APP_PAGE_URI.lightpoint).toBe("page://lightpoint.yunos.com/ShowRoomPage");
    expect(APP_PAGE_URI.smartcar).toBe("page://smartcar.ivi.com/smartcar");
  });
});

describe("resolvePageUri", () => {
  it("resolves known app", () => {
    expect(resolvePageUri("lightpoint")).toBe("page://lightpoint.yunos.com/ShowRoomPage");
  });

  it("returns undefined for unknown app", () => {
    expect(resolvePageUri("nonexistent")).toBeUndefined();
  });
});
