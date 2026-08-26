import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { dispatch } from "../src/cli.js";

const VALIDATOR = join(import.meta.dirname, "../../skills/bridge-analyze/validate-analysis.mjs");

function runValidator(path: string) {
  return spawnSync(process.execPath, [VALIDATOR, path], { encoding: "utf8" });
}

describe("bridge-analyze validator", () => {
  it("accepts the shipped E2E analysis", () => {
    const result = runValidator(join(import.meta.dirname, "../../e2e/bridge-analysis.json"));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("结果: PASS");
  });

  it("rejects the unpromoted car-control candidate list", () => {
    const result = runValidator(join(import.meta.dirname, "../../e2e/bridge-analysis-carcontrol-candidates.json"));
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("结果: FAIL");
  });

  it("rejects a binder capability without an explicit service target", () => {
    const dir = mkdtempSync(join(tmpdir(), "bridge-validator-"));
    const out = join(dir, "analysis.json");
    try {
      const analysis = JSON.parse(readFileSync(join(import.meta.dirname, "../../e2e/bridge-analysis.json"), "utf8"));
      delete analysis.capabilities.find((cap: any) => cap.mechanism === "execmd").serviceClass;
      writeFileSync(out, JSON.stringify(analysis));
      const result = runValidator(out);
      expect(result.status).toBe(1);
      expect(result.stdout + result.stderr).toContain("缺 servicePackage/serviceClass");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is the only analysis validator; the legacy CLI command is absent", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(await dispatch(["validate", "analysis.json"])).toBe(1);
      expect(stderr.mock.calls.flat().join("")).toContain("Unknown command: validate");
    } finally {
      stderr.mockRestore();
    }
  });
});
