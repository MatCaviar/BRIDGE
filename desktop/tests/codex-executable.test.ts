import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "../..");
const resolver = resolve(repositoryRoot, "scripts", "resolve-codex-executable.ps1");
const extensionsRoot = join(process.env.USERPROFILE ?? "", ".vscode", "extensions");
const vscodeCodex = existsSync(extensionsRoot)
  ? readdirSync(extensionsRoot)
    .filter((name) => name.startsWith("openai.chatgpt-"))
    .sort().reverse()
    .map((name) => join(extensionsRoot, name, "bin", "windows-x86_64", "codex.exe"))
    .find(existsSync)
  : undefined;

describe.skipIf(process.platform !== "win32")("Windows Codex executable resolution", () => {
  it("returns an absolute executable discovered by PowerShell", async () => {
    const { stdout } = await run(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolver, "-CommandName", "node.exe"],
      { cwd: repositoryRoot },
    );

    expect(resolve(stdout.trim()).toLowerCase()).toBe(resolve(process.execPath).toLowerCase());
  });

  it.skipIf(!vscodeCodex)("prefers a launchable VS Code extension CLI over a PATH candidate", async () => {
    const { stdout } = await run(
      "powershell.exe",
      [
        "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolver,
        "-CommandName", "where.exe",
        "-VsCodeExtensionsRoot", extensionsRoot,
      ],
      { cwd: repositoryRoot, env: { ...process.env, CODEX_EXECUTABLE: "" } },
    );

    expect(resolve(stdout.trim()).toLowerCase()).toBe(resolve(vscodeCodex!).toLowerCase());
  });

  it("passes the resolved absolute path into the Electron process", async () => {
    const launcher = await readFile(resolve(repositoryRoot, "scripts", "start-workbench.ps1"), "utf8");

    expect(launcher).toContain("resolve-codex-executable.ps1");
    expect(launcher).toMatch(/\$env:CODEX_EXECUTABLE\s*=\s*&\s*\$codexResolver/);
  });
});
