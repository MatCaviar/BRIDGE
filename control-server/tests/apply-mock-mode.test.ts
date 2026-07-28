import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { applyMockMode } from "../src/mcp/session-manager.js";

const YAML = (mockMode: string) => `# MCP Server configuration for demo
adapter:
  mock_mode: ${mockMode}

adb:
  path: "adb"
  use_host: true
`;

let dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.map((d) => import("node:fs").then(({ rmSync }) => rmSync(d, { recursive: true, force: true })))); dirs = []; });

async function fixture(mockMode = "true"): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "mock-mode-"));
  await mkdir(join(dir, "conf"), { recursive: true });
  await writeFile(join(dir, "conf", "config.yaml"), YAML(mockMode), "utf-8");
  dirs.push(dir);
  return dir;
}

describe("applyMockMode", () => {
  it("flips mock_mode true -> false for a real session", async () => {
    const dir = await fixture("true");
    await applyMockMode(dir, "real");
    const after = await readFile(join(dir, "conf", "config.yaml"), "utf-8");
    expect(after).toMatch(/mock_mode:\s*false/);
    expect(after).not.toMatch(/mock_mode:\s*true/);
  });

  it("flips mock_mode false -> true for a mock session", async () => {
    const dir = await fixture("false");
    await applyMockMode(dir, "mock");
    const after = await readFile(join(dir, "conf", "config.yaml"), "utf-8");
    expect(after).toMatch(/mock_mode:\s*true/);
  });

  it("leaves a real config as-is when starting a real session (idempotent)", async () => {
    const dir = await fixture("false");
    await applyMockMode(dir, "real");
    const after = await readFile(join(dir, "conf", "config.yaml"), "utf-8");
    expect(after).toMatch(/mock_mode:\s*false/);
  });

  it("is a no-op (does not throw) when no config exists - test fixtures manage their own mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "no-config-"));
    dirs.push(dir);
    await expect(applyMockMode(dir, "real")).resolves.toBeUndefined();
    await expect(applyMockMode(dir, "mock")).resolves.toBeUndefined();
  });
});
