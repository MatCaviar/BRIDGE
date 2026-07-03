import { spawn } from "node:child_process";
import electronPath from "electron";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Electron local Workbench", () => {
  it("loads the local renderer and exits without an HTTP service", { timeout: 30_000 }, async () => {
    const root = resolve(import.meta.dirname, "../..");
    const output = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolvePromise, reject) => {
      const env = { ...process.env, ELECTRON_DISABLE_GPU: "1", BRIDGE_SMOKE_TEST: "1" };
      delete env.ELECTRON_RUN_AS_NODE;
      const child = spawn(electronPath, [resolve(root, "desktop", "dist", "main.js")], {
        cwd: root,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk) => { stdout += String(chunk); });
      child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      const timeout = setTimeout(() => {
        child.kill();
        resolvePromise({ stdout, stderr: `${stderr}\nElectron smoke test timed out.`, code: null });
      }, 20_000);
      child.once("exit", (code) => {
        clearTimeout(timeout);
        resolvePromise({ stdout, stderr, code });
      });
      child.once("error", reject);
    });
    expect(output.code, output.stderr).toBe(0);
    expect(output.stdout).toContain("BRIDGE_DESKTOP_READY");
    expect(output.stderr).not.toMatch(/ERR_CONNECTION|43140|43141/);
  });
});
