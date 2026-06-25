import { describe, it, expect } from "vitest";
import { fixManifestContentPath } from "../src/commands/deploy.js";

describe("deploy — manifest content_path fix (N13)", () => {
  it("rewrites content_path src/RpcEngine.js → RpcEngine.js (compiled-to-root convention)", () => {
    const manifest = { uri: "page://app.yunos.com/rpcagent", content_path: "src/RpcEngine.js", main: false, capabilities: {}, extension: {} };
    const fixed = fixManifestContentPath(JSON.stringify(manifest, null, 2));
    const parsed = JSON.parse(fixed);
    expect(parsed.content_path).toBe("RpcEngine.js");
    expect(parsed.uri).toBe("page://app.yunos.com/rpcagent");
  });
  it("leaves a non-src content_path unchanged", () => {
    const manifest = { uri: "x", content_path: "RpcEngine.js", main: false, capabilities: {}, extension: {} };
    const fixed = fixManifestContentPath(JSON.stringify(manifest));
    expect(JSON.parse(fixed).content_path).toBe("RpcEngine.js");
  });
  it("is a pure string transform (no app literals, cross-platform)", () => {
    const out = fixManifestContentPath('{"content_path":"src/RpcEngine.js"}');
    expect(out).not.toContain("src/");
    expect(out).toContain("RpcEngine.js");
  });
});
