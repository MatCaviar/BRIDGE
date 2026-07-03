import { describe, expect, it } from "vitest";
import { filterAnalysisBySelection } from "../src/selection.js";

describe("filterAnalysisBySelection", () => {
  it("keeps only explicitly curated capabilities", () => {
    const analysis = { app: { name: "demo" }, capabilities: [{ id: "read" }, { id: "write" }, { id: "hidden" }] } as any;
    expect(filterAnalysisBySelection(analysis, ["read", "write"]).capabilities.map((capability) => capability.id)).toEqual(["read", "write"]);
  });

  it("rejects unknown and empty selections", () => {
    const analysis = { app: { name: "demo" }, capabilities: [{ id: "read" }] } as any;
    expect(() => filterAnalysisBySelection(analysis, [])).toThrow(/empty/i);
    expect(() => filterAnalysisBySelection(analysis, ["invented"])).toThrow(/unknown/i);
  });
});
