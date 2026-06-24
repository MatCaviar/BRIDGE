import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SKILLS = ["mcp-analyze", "mcp-generate", "mcp-pipeline", "mcp-test"];
const SUBCMDS = "validate|scaffold|generate|test|build|register|verify|validate_config|wire_check";

describe("SP-D skills use skill-base-relative CLI path", () => {
  for (const s of SKILLS) {
    it(`${s} references the CLI via ../../cli/bin/mcp-pipeline.js`, () => {
      const md = readFileSync(resolve(__dirname, `../../skills/${s}/SKILL.md`), "utf-8");
      expect(md).toContain("../../cli/bin/mcp-pipeline.js");
    });
    it(`${s} has no bare 'mcp-pipeline <subcmd>' command (all converted to node path)`, () => {
      const md = readFileSync(resolve(__dirname, `../../skills/${s}/SKILL.md`), "utf-8");
      const bare = md.match(new RegExp(`mcp-pipeline (${SUBCMDS})\\b`, "g"));
      expect(bare ?? []).toEqual([]);
    });
  }
});

describe("mcp-generate SKILL declares reply descriptor (C2)", () => {
  const skillPath = resolve(__dirname, "../../skills/mcp-generate/SKILL.md");
  const skill = readFileSync(skillPath, "utf-8");

  it("documents the object reply form with all 4 allowed fields", () => {
    expect(skill).toContain("unwrap");
    expect(skill).toContain("parseJson");
    expect(skill).toContain("valueField");
    expect(skill).toContain("read");
  });
  it("states legacy string reply == { read: <string> }", () => {
    expect(skill).toMatch(/legacy.*string.*reply.*read/i);
  });
  it("shows a worked object-reply example", () => {
    expect(skill).toContain('"unwrap": "result.data"');
  });
});
