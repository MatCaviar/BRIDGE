import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const waitArray = new Int32Array(new SharedArrayBuffer(4));

function newestMtime(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of readdirSync(path)) newest = Math.max(newest, newestMtime(join(path, entry)));
  return newest;
}

function runNpm(cliDir, args) {
  const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
  const commandArgs = process.platform === "win32" ? ["/d", "/s", "/c", "npm", ...args] : args;
  const result = spawnSync(command, commandArgs, { cwd: cliDir, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`npm ${args.join(" ")} failed with exit code ${result.status}`);
}

function acquireLock(cliDir) {
  const key = createHash("sha256").update(resolve(cliDir)).digest("hex").slice(0, 16);
  const lock = join(tmpdir(), `bridge-cli-${key}.lock`);
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      mkdirSync(lock);
      return lock;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 600_000) rmSync(lock, { recursive: true, force: true });
      } catch { /* another process released it */ }
      Atomics.wait(waitArray, 0, 0, 200);
    }
  }
  throw new Error(`timed out waiting for CLI bootstrap lock: ${lock}`);
}

export function ensureCliReady(cliDir) {
  const lock = acquireLock(cliDir);
  try {
    const packageLock = join(cliDir, "package-lock.json");
    const lockHash = createHash("sha256").update(readFileSync(packageLock)).digest("hex");
    const stamp = join(cliDir, "node_modules", ".bridge-package-lock.sha256");
    const installedHash = existsSync(stamp) ? readFileSync(stamp, "utf8").trim() : "";
    if (installedHash !== lockHash) {
      console.log("[bridge] installing CLI dependencies");
      runNpm(cliDir, ["install", "--include=dev", "--no-fund", "--no-audit"]);
      writeFileSync(stamp, `${lockHash}\n`);
    }

    const output = join(cliDir, "dist", "cli.js");
    const inputsMtime = Math.max(
      newestMtime(join(cliDir, "src")),
      newestMtime(join(cliDir, "package.json")),
      newestMtime(join(cliDir, "tsconfig.json")),
    );
    if (!existsSync(output) || inputsMtime > newestMtime(output)) {
      console.log("[bridge] building CLI");
      runNpm(cliDir, ["run", "build"]);
    }
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
