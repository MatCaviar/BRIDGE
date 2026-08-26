import { spawn } from "child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * adb I/O boundary for the BRIDGE host → car executor channel.
 *
 * The invoke D-step talks to the on-car executor (a per-call Activity) over adb: push the cmd file,
 * run `am start`, read the result file. This is the ONE place that touches the `adb` binary, so the
 * orchestration in commands/invoke.ts can be unit-tested against a mock [Adb].
 *
 * Runs shell commands as root (`su 0`) — required to write the executor's internal filesDir mailbox
 * and to read result.json across the app/user boundary (the car's foreground user is 10; adb shell is
 * uid 2000). See memory car-execution-constraints.
 */
export interface Adb {
  /** Push a local file to a device path (the adb sync daemon runs as root, so this reaches /data/local/tmp). */
  push(localPath: string, devicePath: string): Promise<void>;
  /** Run a shell command on device as root (su 0); returns combined stdout. Rejects on non-zero exit. */
  shell(cmd: string): Promise<string>;
}

/** Real [Adb] over the `adb` CLI binary. */
export class CliAdb implements Adb {
  constructor(
    private readonly serial: string,
    private readonly shellPrefix: string = process.env.BRIDGE_ADB_SHELL_PREFIX ?? "su 0 sh -c",
  ) {}

  async push(localPath: string, devicePath: string): Promise<void> {
    await runAdb(this.serial, ["push", localPath, devicePath]);
  }

  async shell(cmd: string): Promise<string> {
    // Default to root for privileged executors. Set BRIDGE_ADB_SHELL_PREFIX="" for plain adb shell,
    // or provide another prefix such as "run-as <package> sh -c" for a different deployment profile.
    const quoted = "'" + cmd.replace(/'/g, "'\\''") + "'";
    const remote = this.shellPrefix.trim() ? `${this.shellPrefix.trim()} ${quoted}` : cmd;
    return runAdb(this.serial, ["shell", remote]);
  }
}

/** Per-user filesDir mailbox path for a package's on-car executor. */
export function mailboxPath(pkg: string, user = 10): string {
  return `/data/user/${user}/${pkg}/files/imrpc`;
}

export function resolveAdbBinary(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.BRIDGE_ADB?.trim()) return env.BRIDGE_ADB.trim();
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const bundledWindowsAdb = resolve(moduleDir, "../../..", "tools", "adb", "adb.exe");
  if (platform === "win32" && existsSync(bundledWindowsAdb)) return bundledWindowsAdb;
  return platform === "win32" ? "adb.exe" : "adb";
}

const ADB_BIN = resolveAdbBinary();

function runAdb(serial: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(ADB_BIN, ["-s", serial, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d.toString()));
    p.stderr.on("data", (d) => (stderr += d.toString()));
    p.on("error", (e) => reject(new Error(`adb spawn failed: ${e.message}`)));
    p.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`adb ${args[0]} exited ${code}: ${(stderr || stdout).trim()}`));
    });
  });
}
