#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  const result = spawnSync(commandFile(command), commandArgs(command, args), { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd} with exit code ${result.status}`);
  }
}

function ensurePackageReady(dir, distEntry) {
  if (!existsSync(resolve(dir, "node_modules"))) {
    run("npm", ["install", "--no-fund", "--no-audit"], dir);
  }
  if (!existsSync(resolve(dir, distEntry))) {
    run("npx", ["tsc"], dir);
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
