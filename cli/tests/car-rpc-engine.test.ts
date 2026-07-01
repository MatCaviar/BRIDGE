import { describe, it, expect } from "vitest";
import { generateCarRpcEngine } from "../src/generators/car-rpc-engine.js";

const SAMPLE = { app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" }, capabilities: [] };

describe("generateCarRpcEngine", () => {
  it("emits a non-empty RpcEngine.ts module + manifest-page.json", () => {
    const f = generateCarRpcEngine(SAMPLE);
    const engine = f.get("car-side/RpcEngine.ts")!;
    expect(engine.length).toBeGreaterThan(0);
    expect(engine).toMatch(/\bexport\b/); // real TS module, not an empty/corrupt asset
    const manifest = f.get("car-side/manifest-page.json")!;
    expect(manifest.length).toBeGreaterThan(0);
  });
  it("manifest-page.json targets the <name> rpcagent page and points at the compiled engine", () => {
    const f = generateCarRpcEngine(SAMPLE);
    const mp = JSON.parse(f.get("car-side/manifest-page.json")!);
    expect(mp.uri).toBe("page://testapp.yunos.com/rpcagent");
    expect(mp.content_path).toBe("src/RpcEngine.js");
  });
  it("RpcEngine.ts is a static, app-agnostic asset — identical bytes for any app name", () => {
    // Positive parameterization guard (not a reverse "not contains X" assertion):
    // the engine is a bundled template, so two different app names MUST yield
    // identical bytes. If an app name ever leaks into the template, a !== b fails.
    const a = generateCarRpcEngine({ ...SAMPLE, app: { ...SAMPLE.app, name: "alpha" } })
      .get("car-side/RpcEngine.ts")!;
    const b = generateCarRpcEngine({ ...SAMPLE, app: { ...SAMPLE.app, name: "beta" } })
      .get("car-side/RpcEngine.ts")!;
    expect(a).toBe(b);
    expect(a).toContain("onStart"); // non-empty + lifecycle hook present
  });
});
