import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

describe("SP-D hooks", () => {
  it("hooks.json invokes polyglot run-hook.cmd session-init.sh (no inline npm/tsc)", () => {
    const h = readFileSync(resolve(__dirname, "../../hooks/hooks.json"), "utf-8");
    expect(h).toContain("run-hook.cmd");
    expect(h).toContain("session-init.sh");
    expect(h).not.toMatch(/npm install/);
    expect(h).not.toMatch(/tsc --noEmit/);
  });
  it("session-init.sh builds framework BEFORE cli (cli depends on @im/mcp-server-framework → framework/dist)", () => {
    const s = readFileSync(resolve(__dirname, "../../hooks/session-init.sh"), "utf-8");
    expect(s).toContain("framework/dist/index.js");
    expect(s.indexOf("framework/dist/index.js")).toBeLessThan(s.indexOf("cli/dist/cli.js"));
  });
  it("session-init.sh builds dist (emit, not --noEmit) and fails loud", () => {
    const s = readFileSync(resolve(__dirname, "../../hooks/session-init.sh"), "utf-8");
    expect(s).toContain("CLAUDE_PLUGIN_ROOT");
    expect(s).toMatch(/npx tsc[) "]/);
    expect(s).not.toContain("--noEmit");
    expect(s).toMatch(/dist\/cli\.js/);
    expect(s).not.toMatch(/2>\/dev\/null/);
    expect(s).toMatch(/exit 1|set -e/);
  });
});
