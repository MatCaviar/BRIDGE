import { describe, it, expect } from "vitest";
import { generateCarRpcEngine } from "../src/generators/car-rpc-engine.js";

const SAMPLE = { app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" }, capabilities: [] };

describe("generateCarRpcEngine", () => {
  it("emits RpcEngine.ts + manifest-page.json", () => {
    const f = generateCarRpcEngine(SAMPLE);
    expect(f.get("car-side/RpcEngine.ts")).toBeTruthy();
    expect(f.get("car-side/manifest-page.json")).toBeTruthy();
  });
  it("manifest page targets <name> domain", () => {
    const f = generateCarRpcEngine(SAMPLE);
    const mp = JSON.parse(f.get("car-side/manifest-page.json")!);
    expect(mp.uri).toBe("page://testapp.yunos.com/rpcagent");
    expect(mp.content_path).toBe("src/RpcEngine.js");
  });
  it("RpcEngine.ts is generic (no imaudio literal)", () => {
    const engine = generateCarRpcEngine(SAMPLE).get("car-side/RpcEngine.ts")!;
    expect(engine).toContain("onStart");
    expect(engine).not.toContain("imaudio");
  });
});
