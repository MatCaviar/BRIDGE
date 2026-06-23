#!/usr/bin/env node
async function main() {
  const { dispatch } = await import("../dist/cli.js");
  const exitCode = await dispatch(process.argv.slice(2));
  process.exitCode = exitCode;
}
main().catch((error) => {
  process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
