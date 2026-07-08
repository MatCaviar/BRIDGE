import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("mcp-analyze source-first instructions", () => {
  it("treats imported schemas as format references rather than target catalogs", async () => {
    const skill = await readFile(resolve(import.meta.dirname, "../../skills/mcp-analyze/SKILL.md"), "utf8");
    expect(skill).toContain("output-format reference");
    expect(skill).toContain("Candidate capabilities come only from source");
    expect(skill).not.toMatch(/target schema requests|target gap|目标缺口/i);
  });
});
