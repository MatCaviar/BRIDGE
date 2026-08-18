import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "path";

describe("check-manifests", () => {
  it("exits 0 + 'manifests agree' when shared semantics align", () => {
    const script = resolve(__dirname, "../../scripts/check-manifests.js");
    const root = resolve(__dirname, "../..");
    const out = execFileSync("node", [script], { cwd: root, encoding: "utf-8" });
    expect(out).toContain("manifests agree");
  });
});
