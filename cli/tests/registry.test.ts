import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const ANALYSIS = join(ROOT, "e2e/bridge-analysis.json");
const GENERATOR = join(ROOT, "e2e/analysis-to-registry.mjs");

describe("analysis-to-registry", () => {
  it("projects every active capability and keeps intent routing on its tool", () => {
    const dir = mkdtempSync(join(tmpdir(), "bridge-registry-"));
    const out = join(dir, "registry.json");
    try {
      execFileSync(process.execPath, [GENERATOR, ANALYSIS, out], { stdio: "pipe" });
      const analysis = JSON.parse(readFileSync(ANALYSIS, "utf8"));
      const registry = JSON.parse(readFileSync(out, "utf8"));
      const active = analysis.capabilities.filter((cap: any) => cap.status !== "broken");

      expect(registry.tools.map((tool: any) => tool.id)).toEqual(active.map((cap: any) => cap.id));
      const intents = registry.tools.filter((tool: any) => tool.mechanism === "intent");
      expect(intents.length).toBeGreaterThan(0);
      expect(intents.every((tool: any) => tool.component || tool.intentScreens)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
