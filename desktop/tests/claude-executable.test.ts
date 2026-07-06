import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const resolver = resolve(repositoryRoot, "scripts", "resolve-claude-executable.ps1");
const npmRoot = join(process.env.APPDATA ?? "", "npm");
// Claude Code installed via `npm i -g @anthropic-ai/claude-code` ships cmd/ps1 shims here.
const claudeShim = existsSync(join(npmRoot, "claude.cmd"))
  ? join(npmRoot, "claude.cmd")
  : existsSync(join(npmRoot, "claude.ps1"))
    ? join(npmRoot, "claude.ps1")
    : undefined;

describe.skipIf(process.platform !== "win32" || !claudeShim)("Windows Claude executable resolution", () => {
  it("resolves to the real claude.exe, not a .cmd/.ps1 shim that spawn(shell:false) cannot run", async () => {
    const { stdout } = await run(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolver],
      { cwd: repositoryRoot, env: { ...process.env, CLAUDE_EXECUTABLE: "" } },
    );

    const resolved = resolve(stdout.trim());
    expect(resolved.toLowerCase()).toMatch(/\.exe$/);
    expect(existsSync(resolved)).toBe(true);
  });
});
