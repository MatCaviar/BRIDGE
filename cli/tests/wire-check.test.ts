import { describe, it, expect } from "vitest";
import { wireCheck, wireCheckProvenance, extractExpectedWire } from "../src/commands/wire-check.js";

const PROXY_SRC = `
getFeature() {
  let msg = this._iface.createMethodCallMessage("request");
  const params = { funcName: "featureservice.example.com/modules/getFeature" };
  msg.writeString(JSON.stringify(params));
  let data = result.readJSON();
}`;
const CONFIG = {
  feature_read: { type: "dbus", bus: "com.example.featureservice", path: "/com/example/featureservice",
    method: "request", arg: { funcName: "featureservice.example.com/modules/getFeature" }, reply: "json" },
};

describe("wireCheck", () => {
  it("extractExpectedWire pulls funcName + method from common proxy pattern", () => {
    const wires = extractExpectedWire(PROXY_SRC);
    expect(wires.length).toBeGreaterThan(0);
    expect(wires[0].method).toBe("request");
    expect(wires[0].arg.funcName).toContain("getFeature");
  });
  it("valid when config matches extracted wire", () => {
    expect(wireCheck(CONFIG, PROXY_SRC).valid).toBe(true);
  });
  it("invalid when config funcName diverges", () => {
    const bad = { feature_read: { ...CONFIG.feature_read, arg: { funcName: "WRONG" } } };
    expect(wireCheck(bad, PROXY_SRC).valid).toBe(false);
  });
  it("invalid when config method diverges (funcName matches — exercises the real comparison)", () => {
    const bad = { feature_read: { ...CONFIG.feature_read, method: "WRONG" } };
    expect(wireCheck(bad, PROXY_SRC).valid).toBe(false);
  });
  it("fails closed when proxy source has no recognizable wire pattern (no vacuous pass)", () => {
    expect(wireCheck(CONFIG, "const x = 1; // no proxy patterns here").valid).toBe(false);
  });
  it("flags an invented op whose funcName is absent from proxy (reverse check — the forward blind spot)", () => {
    // The whole point of the reverse check: a config op whose funcName was never in any proxy.
    // The forward (proxy→config) loop never visits it, so without the reverse check it would pass silently.
    const invented = {
      ...CONFIG,
      ghost_read: { type: "dbus", bus: "com.example.ghost", path: "/g", method: "request",
        arg: { funcName: "ghost.example.com/nonexistent" }, reply: "json" },
    };
    const r = wireCheck(invented, PROXY_SRC);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /ghost_read/.test(e))).toBe(true);
  });
  it("accepts a config op whose funcName lives in a second joined proxy source (multi-proxy)", () => {
    // An app spans multiple proxies; wireCheckCommand joins them, so an op only needs to match ONE.
    const proxyB = `doOther() { const m = this._iface.createMethodCallMessage("request"); const p = { funcName: "other.example.com/modules/doOther" }; m.writeString(JSON.stringify(p)); }`;
    const joined = PROXY_SRC + "\n" + proxyB;
    const cfg = {
      feature_read: CONFIG.feature_read,
      other_read: { type: "dbus", bus: "com.example.other", path: "/o", method: "request",
        arg: { funcName: "other.example.com/modules/doOther" }, reply: "json" },
    };
    expect(wireCheck(cfg, joined).valid).toBe(true);
  });
  it("accepts an IMAudio/MAF-style op identified by method (no arg.funcName — method IS the call name)", () => {
    // These apps use createMethodCallMessage("<methodName>") directly — no funcName. The reverse check
    // must anchor on `method`, not demand funcName (which would falsely reject every such op).
    const proxyImaudio = `queryThing() { const m = this._iface.createMethodCallMessage("queryThing"); m.writeString(JSON.stringify({ body: {} })); }`;
    const cfg = {
      thing_query: { type: "dbus", bus: "imaudio.alios.cn", path: "/x", method: "queryThing",
        arg: { body: { a: "${a}" } }, reply: "json" },
    };
    expect(wireCheck(cfg, proxyImaudio).valid).toBe(true);
  });
  it("flags an invented IMAudio/MAF-style op whose method is absent from proxy", () => {
    const proxyImaudio = `queryThing() { const m = this._iface.createMethodCallMessage("queryThing"); }`;
    const cfg = {
      ghost_query: { type: "dbus", bus: "imaudio.alios.cn", path: "/x", method: "totallyMadeUp",
        arg: { body: {} }, reply: "json" },
    };
    const r = wireCheck(cfg, proxyImaudio);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /ghost_query/.test(e))).toBe(true);
  });
});

describe("wireCheckProvenance (co-occurrence: bus/path/interface must live in the declaring proxy)", () => {
  const proxyA = {
    name: "AProxy.ts",
    src: `constructor() { super({ busName: "svc.a", busPath: "/a", interface: "iface.a" }); }
      queryThing() { const m = this._iface.createMethodCallMessage("queryThing"); m.writeString("{}"); }`,
  };
  it("valid when bus/path/interface all co-occur in the declaring proxy", () => {
    const cfg = {
      thing_query: { type: "dbus", bus: "svc.a", path: "/a", interface: "iface.a", method: "queryThing", arg: {}, reply: "json" },
    };
    expect(wireCheckProvenance(cfg, [proxyA]).valid).toBe(true);
  });
  it("invalid: wrong interface (e.g. defaulted bus+'.interface') not in declaring proxy — the MAF-class bug", () => {
    const cfg = {
      thing_query: { type: "dbus", bus: "svc.a", path: "/a", interface: "svc.a.interface", method: "queryThing", arg: {}, reply: "json" },
    };
    const r = wireCheckProvenance(cfg, [proxyA]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /interface "svc\.a\.interface" not found/.test(e))).toBe(true);
  });
  it("invalid: wrong bus (method declared in proxy A, bus from proxy B)", () => {
    const cfg = {
      thing_query: { type: "dbus", bus: "svc.b", path: "/a", method: "queryThing", arg: {}, reply: "json" },
    };
    const r = wireCheckProvenance(cfg, [proxyA]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => /bus "svc\.b" not found/.test(e))).toBe(true);
  });
  it("multi-proxy: op valid when its bus/path/interface co-occur in its OWN proxy among several", () => {
    const proxyB = {
      name: "BProxy.ts",
      src: `constructor() { super({ busName: "svc.b", busPath: "/b", interface: "iface.b" }); }
        doOther() { const m = this._iface.createMethodCallMessage("doOther"); m.writeString("{}"); }`,
    };
    const cfg = {
      thing_query: { type: "dbus", bus: "svc.a", path: "/a", interface: "iface.a", method: "queryThing", arg: {}, reply: "json" },
      other_do: { type: "dbus", bus: "svc.b", path: "/b", interface: "iface.b", method: "doOther", arg: {}, reply: "json" },
    };
    expect(wireCheckProvenance(cfg, [proxyA, proxyB]).valid).toBe(true);
  });
  it("surface-coverage: a proxy method with no config op is reported as uncovered (informational, not error)", () => {
    // forgottenMethod is declared in the proxy but no config op wires it → appears in `uncovered`.
    // result stays valid (it's a warning, not a hard failure — could be intentionally deferred/internal).
    const proxyWithExtra = {
      name: "AProxy.ts",
      src: `constructor() { super({ busName: "svc.a", busPath: "/a", interface: "iface.a" }); }
        queryThing() { const m = this._iface.createMethodCallMessage("queryThing"); m.writeString("{}"); }
        forgottenMethod() { const m = this._iface.createMethodCallMessage("forgottenMethod"); m.writeString("{}"); }`,
    };
    const cfg = {
      thing_query: { type: "dbus", bus: "svc.a", path: "/a", interface: "iface.a", method: "queryThing", arg: {}, reply: "json" },
    };
    const r = wireCheckProvenance(cfg, [proxyWithExtra]);
    expect(r.valid).toBe(true);
    expect(r.uncovered).toEqual(expect.arrayContaining(["forgottenMethod"]));
  });
});
