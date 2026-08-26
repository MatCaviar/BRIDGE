import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const readJson = (p: string) => JSON.parse(readFileSync(resolve(__dirname, p), "utf-8"));

describe("SP-D claude manifest", () => {
  it("declares the existing skill and hook paths without a dangling commands path", () => {
    const p = readJson("../../.claude-plugin/plugin.json");
    expect(p.name).toBe("im-mcp-codeagent");
    expect(p.skills).toEqual(["./skills/"]);
    expect(p.commands).toBeUndefined();
    expect(p.hooks).toBe("./hooks/hooks.json");
    expect(p.defaultEnabled).toBe(true);
    expect(typeof p.version).toBe("string");
    expect(p.homepage).toBe("https://github.com/MatCaviar/BRIDGE");
    expect(p.repository).toBe("https://github.com/MatCaviar/BRIDGE");
    const hooks = readJson("../../hooks/hooks.json");
    const command = hooks.hooks.SessionStart[0].hooks[0].command;
    expect(command).toContain("hooks/session-init.mjs");
    expect(existsSync(resolve(__dirname, "../../hooks/session-init.mjs"))).toBe(true);
    expect(existsSync(resolve(__dirname, "../bin/bootstrap.js"))).toBe(true);
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
