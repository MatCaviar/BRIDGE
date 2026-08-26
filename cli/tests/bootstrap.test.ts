import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const BOOTSTRAP = join(import.meta.dirname, "../bin/bootstrap.js");

describe("CLI bootstrap", () => {
  it("keeps first-run install and build output off MCP stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "bridge-bootstrap-输出 "));
    try {
      mkdirSync(join(dir, "src"));
      writeFileSync(join(dir, "src", "index.ts"), "export {};\n");
      writeFileSync(join(dir, "package.json"), JSON.stringify({
        name: "bridge-bootstrap-fixture",
        version: "1.0.0",
        type: "module",
        scripts: { build: "node build.mjs" },
      }));
      writeFileSync(join(dir, "package-lock.json"), JSON.stringify({
        name: "bridge-bootstrap-fixture",
        version: "1.0.0",
        lockfileVersion: 3,
        requires: true,
        packages: { "": { name: "bridge-bootstrap-fixture", version: "1.0.0" } },
      }));
      writeFileSync(join(dir, "build.mjs"), [
        'import { mkdirSync, writeFileSync } from "node:fs";',
        'mkdirSync("dist", { recursive: true });',
        'writeFileSync("dist/cli.js", "export {};\\n");',
      ].join("\n"));
      const runner = join(dir, "run.mjs");
      writeFileSync(runner, [
        `import { ensureCliReady } from ${JSON.stringify(pathToFileURL(BOOTSTRAP).href)};`,
        `ensureCliReady(${JSON.stringify(dir)});`,
      ].join("\n"));

      const result = spawnSync(process.execPath, [runner], { encoding: "utf8" });
      expect(result.status, result.stderr).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("[bridge] installing CLI dependencies");
      expect(result.stderr).toContain("[bridge] building CLI");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
