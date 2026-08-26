#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ensureCliReady } from "./bootstrap.js";

const BIN_DIR = dirname(fileURLToPath(import.meta.url));
const CLI_DIR = resolve(BIN_DIR, "..");

async function main() {
  ensureCliReady(CLI_DIR);
  const { dispatch } = await import(pathToFileURL(resolve(CLI_DIR, "dist/cli.js")).href);
  const exitCode = await dispatch(process.argv.slice(2));
  process.exitCode = exitCode;
}
main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
