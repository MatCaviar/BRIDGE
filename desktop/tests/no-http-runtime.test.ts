import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

describe("local Workbench runtime", () => {
  it("contains no HTTP server, REST client, SSE client, or fixed Workbench port", () => {
    const pkg = readFileSync(resolve(root, "package.json"), "utf8");
    const start = readFileSync(resolve(root, "scripts", "start-workbench.ps1"), "utf8");
    expect(pkg).not.toMatch(/workbench:api|concurrently|43140|43141/);
    expect(start).not.toMatch(/https?:\/\/|43140|43141/);
    expect(existsSync(resolve(root, "control-server", "src", "http", "router.ts"))).toBe(false);
    expect(existsSync(resolve(root, "control-server", "src", "server.ts"))).toBe(false);
    expect(existsSync(resolve(root, "control-server", "src", "start.ts"))).toBe(false);
    expect(existsSync(resolve(root, "ui", "src", "api", "client.ts"))).toBe(false);
    expect(existsSync(resolve(root, "ui", "src", "api", "events.ts"))).toBe(false);
  });
});
