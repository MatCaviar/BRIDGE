import { execFile } from "child_process";
import { resolve } from "path";
import { existsSync, statSync } from "fs";
import { readState, writeState, createInitialState, updateStep, appNameFromProjectDir } from "../state/manager.js";

function commandFile(command: "npm" | "npx"): string {
  return process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command;
}

function commandArgs(command: "npm" | "npx", args: string[]): string[] {
  return process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
}

async function npmInstallIfNeeded(dir: string): Promise<void> {
  const nodeModules = resolve(dir, "node_modules");
  const pkgJson = resolve(dir, "package.json");
  const lockFile = resolve(dir, "package-lock.json");

  let needInstall = true;
  if (existsSync(nodeModules) && existsSync(lockFile)) {
    const lockMtime = statSync(lockFile).mtimeMs;
    const nodeMtime = statSync(nodeModules).mtimeMs;
    // Skip install if node_modules is newer than lockfile
    if (nodeMtime >= lockMtime) {
      needInstall = false;
    }
  }

  if (needInstall) {
    await new Promise<void>((resolvePromise, reject) => {
      execFile(
        commandFile("npm"),
        commandArgs("npm", ["install"]),
        { cwd: dir, maxBuffer: 10 * 1024 * 1024 },
        (error) => {
          if (error) {
            reject(new Error(`npm install failed: ${error.message}`));
          } else {
            resolvePromise();
          }
        },
      );
    });
  }
}

async function tscBuild(dir: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    execFile(
      commandFile("npx"),
      commandArgs("npx", ["tsc"]),
      { cwd: dir, maxBuffer: 10 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`TypeScript build failed:\n${stderr}`));
        } else {
          resolvePromise();
        }
      },
    );
  });
}

export async function buildProject(dir: string): Promise<void> {
  const resolvedDir = resolve(dir);
  await npmInstallIfNeeded(resolvedDir);
  await tscBuild(resolvedDir);
}

export async function buildCommand(args: string[]): Promise<void> {
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    throw new Error("Usage: mcp-pipeline build --dir <project-dir>");
  }

  const resolvedDir = resolve(dir);
  if (!existsSync(resolvedDir)) {
    throw new Error("Directory not found: " + resolvedDir);
  }

  const appName = appNameFromProjectDir(resolvedDir);
  let state = readState(appName) ?? createInitialState(appName, resolvedDir);
  try {
    state = updateStep(state, "build", { status: "in_progress" });
    writeState(state);
  } catch {}

  try {
    await buildProject(resolvedDir);
    try {
      state = updateStep(state, "build", { status: "completed" });
      writeState(state);
    } catch {}
    process.stdout.write("Build succeeded: " + resolvedDir + "\n");
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    try {
      state = updateStep(state, "build", { status: "failed", error: errorMsg });
      writeState(state);
    } catch {}
    throw error;
  }
}
