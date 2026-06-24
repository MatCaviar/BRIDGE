import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const readJson = (p: string) => JSON.parse(readFileSync(resolve(__dirname, p), "utf-8"));

describe("SP-D claude manifest", () => {
  it("declares skills + commands explicitly + metadata (hooks auto-loaded, not declared)", () => {
    const p = readJson("../../.claude-plugin/plugin.json");
    expect(p.name).toBe("im-mcp-codeagent");
    expect(p.skills).toEqual(["./skills/"]);
    expect(p.commands).toEqual(["./commands/"]);
    expect(p.hooks).toBeUndefined(); // hooks/hooks.json is auto-loaded by Claude Code; declaring it triggered a duplicate-hooks error
    expect(p.defaultEnabled).toBe(true);
    expect(typeof p.version).toBe("string");
    expect(p.homepage).toBeTruthy();
    expect(p.repository).toBeTruthy();
  });
});

describe("SP-D codex manifest mirror", () => {
  it(".codex-plugin/plugin.json mirrors skills path (Codex has no commands)", () => {
    const c = readJson("../../.codex-plugin/plugin.json");
    expect(c.name).toBe("im-mcp-codeagent");
    expect(JSON.stringify(c)).toContain("./skills/");
    // Codex rejects `commands` and `hooks`; only `skills` is mirrored.
    expect(c.commands).toBeUndefined();
    expect(c.hooks).toBeUndefined();
  });
});

describe("SP-D marketplace", () => {
  it("local marketplace lists im-mcp-codeagent with source ./", () => {
    const m = readJson("../../.claude-plugin/marketplace.json");
    expect(m.name).toBeTruthy();
    expect(Array.isArray(m.plugins)).toBe(true);
    expect(
      m.plugins.some((pl: any) => pl.name === "im-mcp-codeagent" && pl.source === "./")
    ).toBe(true);
  });
});
