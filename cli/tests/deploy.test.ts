import { describe, it, expect, afterAll } from "vitest";
import { deployCommand } from "../src/commands/deploy.js";
import { resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const TMP_ROOT = resolve(import.meta.dirname, "../_deploy_tmp");

function tmpDir(): string {
  return resolve(TMP_ROOT, `deploy-${randomUUID().slice(0, 8)}`);
}

afterAll(() => {
  if (existsSync(TMP_ROOT)) {
    try { rmSync(TMP_ROOT, { recursive: true, force: true }); } catch { /* Windows EPERM on open handles */ }
  }
}, 60_000);

describe("deployCommand", () => {
  it("copies the generated artifact tree to the target", async () => {
    const root = tmpDir();
    const from = resolve(root, "generated", "mcp-demo");
    const to = resolve(root, "sibling", "mcp-demo");
    mkdirSync(resolve(from, "rpc"), { recursive: true });
    writeFileSync(resolve(from, "package.json"), '{"name":"mcp-demo"}\n');
    writeFileSync(resolve(from, "rpc", "config.json"), '{}\n');

    await deployCommand(["--from", from, "--to", to]);

    expect(existsSync(resolve(to, "package.json"))).toBe(true);
    expect(existsSync(resolve(to, "rpc", "config.json"))).toBe(true);
    expect(readFileSync(resolve(to, "package.json"), "utf8")).toContain("mcp-demo");
  });

  it("replaces a prior export so stale files do not linger", async () => {
    const root = tmpDir();
    const from = resolve(root, "generated", "mcp-demo");
    const to = resolve(root, "sibling", "mcp-demo");
    mkdirSync(from, { recursive: true });
    writeFileSync(resolve(from, "package.json"), '{"name":"mcp-demo"}\n');
    // a previous deploy left an extra file that the current generatedRoot no longer has
    mkdirSync(to, { recursive: true });
    writeFileSync(resolve(to, "stale-from-before.ts"), "old\n");

    await deployCommand(["--from", from, "--to", to]);

    expect(existsSync(resolve(to, "package.json"))).toBe(true);
    expect(existsSync(resolve(to, "stale-from-before.ts"))).toBe(false);
  });

  it("creates the target parent when it does not yet exist (source tree moved since import)", async () => {
    const root = tmpDir();
    const from = resolve(root, "generated", "mcp-demo");
    const to = resolve(root, "missing-parent", "mcp-demo");
    mkdirSync(from, { recursive: true });
    writeFileSync(resolve(from, "package.json"), '{}\n');

    await deployCommand(["--from", from, "--to", to]);

    expect(existsSync(resolve(to, "package.json"))).toBe(true);
  });

  it("fails clearly when the source directory is missing", async () => {
    const root = tmpDir();
    const to = resolve(root, "sibling", "mcp-demo");
    await expect(deployCommand(["--from", resolve(root, "nope"), "--to", to])).rejects.toThrow(/Source .* not found/i);
  });

  it("fails when --from or --to is absent", async () => {
    await expect(deployCommand(["--from", "/tmp/x"])).rejects.toThrow(/Usage/i);
    await expect(deployCommand([])).rejects.toThrow(/Usage/i);
  });
});
