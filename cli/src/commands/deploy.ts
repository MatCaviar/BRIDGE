import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** `mcp-pipeline deploy --from <generated-dir> --to <target-dir>` exports the generated MCP Server
 *  artifact to a sibling of the original source directory, restoring the headless "product beside
 *  source" layout. The workbench derives `--to` from the trusted, persisted original source path
 *  and gates the call behind typed-project-name confirmation; this command only performs the copy.
 *
 *  A prior deploy target (a generated `mcp-<app>` folder) is replaced wholesale so the export is a
 *  clean mirror of `generatedRoot` — no stale files from a previous run linger. The target name is a
 *  workbench-generated artifact slug, never an arbitrary user folder, and the caller has already
 *  typed the project name to confirm. */
export async function deployCommand(args: string[]): Promise<void> {
  const fromIdx = args.indexOf("--from");
  const toIdx = args.indexOf("--to");
  if (fromIdx === -1 || toIdx === -1) {
    throw new Error("Usage: mcp-pipeline deploy --from <generated-dir> --to <target-dir>");
  }
  const fromArg = args[fromIdx + 1];
  const toArg = args[toIdx + 1];
  if (!fromArg || fromArg.startsWith("--")) throw new Error("--from requires a value");
  if (!toArg || toArg.startsWith("--")) throw new Error("--to requires a value");

  const from = resolve(fromArg);
  const to = resolve(toArg);

  if (!existsSync(from) || !statSync(from).isDirectory()) {
    throw new Error("Source (generated) directory not found: " + from);
  }
  if (existsSync(to)) {
    // Replace a prior export so re-deploys are a clean mirror of the current generatedRoot.
    rmSync(to, { recursive: true, force: true });
  } else {
    // Create the parent (the original source's directory) in case the source tree was moved/deleted
    // since import — the export should still land beside where it used to be.
    mkdirSync(dirname(to), { recursive: true });
  }

  cpSync(from, to, { recursive: true });
  const fileCount = countFiles(to);
  process.stdout.write("Deployed: " + from + " -> " + to + "\n");
  process.stdout.write("  Files: " + fileCount + "\n");
}

function countFiles(dir: string): number {
  let count = 0;
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      const full = resolve(current, entry);
      if (statSync(full).isDirectory()) stack.push(full);
      else count++;
    }
  }
  return count;
}
