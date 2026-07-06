#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BIN_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(BIN_DIR, "..");
const ROOT_DIR = resolve(CLI_DIR, "..");
const FRAMEWORK_DIR = resolve(ROOT_DIR, "framework");

function commandFile(command) {
  return process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : command;
}

function commandArgs(command, args) {
  return process.platform === "win32" ? ["/d", "/s", "/c", command, ...args] : args;
}

function run(command, args, cwd) {
  // windowsHide keeps cmd.exe (ComSpec) from flashing a visible console window when this bin is
  // driven headless from the Electron workbench. stdio:"inherit" still forwards npm/tsc output.
  const result = spawnSync(commandFile(command), commandArgs(command, args), { cwd, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd} with exit code ${result.status}`);
  }
}

function newestSourceMtime(root) {
  let newest = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestSourceMtime(full));
    else if (entry.name.endsWith(".ts")) newest = Math.max(newest, statSync(full).mtimeMs);
  }
  return newest;
}

// dist is fresh when the entry exists and no .ts source under src/ is newer than it. Rebuilding
// on every invocation is wasteful, and a re-build of an already-present dist can deadlock tsc on
// Windows when those output files are briefly held open by a prior process. The workbench also
// pre-builds via `workbench:build`, so in normal runs this is a no-op.
function isDistFresh(dir, distEntry) {
  const distPath = resolve(dir, distEntry);
  if (!existsSync(distPath)) return false;
  const distMtime = statSync(distPath).mtimeMs;
  try { return newestSourceMtime(resolve(dir, "src")) <= distMtime; } catch { return false; }
}

function ensurePackageReady(dir, distEntry) {
  const manifest = JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8"));
  const dependencies = [...Object.keys(manifest.dependencies ?? {}), ...(manifest.scripts?.build ? ["typescript"] : [])];
  const missingDependency = dependencies.find((name) => !existsSync(resolve(dir, "node_modules", ...name.split("/"))));
  if (!existsSync(resolve(dir, "node_modules")) || missingDependency) run("npm", ["install", "--prefer-offline", "--no-fund", "--no-audit"], dir);
  if (!isDistFresh(dir, distEntry)) {
    run("npm", ["run", "build"], dir);
    if (!existsSync(resolve(dir, distEntry))) throw new Error(`Build output is missing: ${resolve(dir, distEntry)}`);
  }
}

function ensureBuilt() {
  ensurePackageReady(FRAMEWORK_DIR, "dist/index.js"); // framework/dist/index.js
  ensurePackageReady(CLI_DIR, "dist/cli.js"); // cli/dist/cli.js
}

async function main() {
  ensureBuilt();
  const { dispatch } = await import(pathToFileURL(resolve(CLI_DIR, "dist/cli.js")).href);
  const exitCode = await dispatch(process.argv.slice(2));
  process.exitCode = exitCode;
}
main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
