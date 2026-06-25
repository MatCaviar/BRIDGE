import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

/** Rewrite a manifest-page.json's content_path from `src/RpcEngine.js` → `RpcEngine.js`.
 *  After tsc compiles car-side/*.ts with outDir=car-side, the .js sits at car-side/RpcEngine.js,
 *  so the manifest (which the page engine resolves relative to the bundle root) must drop the src/ prefix.
 *  Pure string transform — app-agnostic, cross-platform. */
export function fixManifestContentPath(manifestJson: string): string {
  const obj = JSON.parse(manifestJson) as { content_path?: string; [k: string]: unknown };
  if (typeof obj.content_path === "string") {
    obj.content_path = obj.content_path.replace(/^src\//, "");
  }
  return JSON.stringify(obj, null, 2) + "\n";
}

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((pass, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? pass() : fail(new Error(`${cmd} exited ${code}`))));
  });
}

export interface DeployOpts {
  readonly projectDir: string;
  readonly adbPath?: string;       // default "adb" (PATH)
  readonly useHost?: boolean;      // -host flag
  readonly mailboxPath?: string;   // default /sdcard/imrpc
}

/** tsc-compile car-side, fix manifest, push config.json + RpcEngine.js to the device mailbox. */
export async function deploy(opts: DeployOpts): Promise<void> {
  const project = resolve(opts.projectDir);
  const carSide = resolve(project, "car-side");
  const rpcDir = resolve(project, "rpc");
  if (!existsSync(carSide)) throw new Error(`car-side/ not found: ${carSide}`);
  if (!existsSync(resolve(rpcDir, "config.json"))) throw new Error(`rpc/config.json not found: ${rpcDir}`);

  // (i) compile car-side/*.ts → car-side/*.js (tsc via PATH, cross-platform)
  await run("npx", ["tsc", "--outDir", carSide, "--rootDir", carSide, ...collectTsFiles(carSide)], carSide);

  // fix manifest content_path
  const manifestPath = resolve(carSide, "manifest-page.json");
  if (existsSync(manifestPath)) {
    const fixed = fixManifestContentPath(readFileSync(manifestPath, "utf-8"));
    writeFileSync(manifestPath, fixed, "utf-8");
  }

  // (ii) adb-push config.json + RpcEngine.js to the device mailbox
  const adb = opts.adbPath ?? "adb";
  const hostArgs = opts.useHost === false ? [] : ["-host"];
  const mailbox = opts.mailboxPath ?? "/sdcard/imrpc";
  await run(adb, [...hostArgs, "shell", "mkdir", "-p", mailbox]);
  await run(adb, [...hostArgs, "push", resolve(rpcDir, "config.json"), `${mailbox}/config.json`]);
  const compiledEngine = resolve(carSide, "RpcEngine.js");
  if (!existsSync(compiledEngine)) throw new Error(`compiled RpcEngine.js not found: ${compiledEngine} — tsc step failed`);
  await run(adb, [...hostArgs, "push", compiledEngine, `${mailbox}/RpcEngine.js`]);
  process.stdout.write(`Deployed config.json + RpcEngine.js → device ${mailbox}\n`);
}

function collectTsFiles(dir: string): string[] {
  // minimal: compile all .ts in car-side root (RpcEngine.ts). Avoids a glob dep.
  return readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => resolve(dir, f));
}

export async function deployCommand(args: string[]): Promise<void> {
  const projectDir = args.find((a) => !a.startsWith("--"));
  if (!projectDir) throw new Error("Usage: mcp-pipeline deploy <project-dir> [--adb <path>] [--no-host] [--mailbox <path>]");
  const adbFlag = args.indexOf("--adb");
  const noHost = args.includes("--no-host");
  const mailboxFlag = args.indexOf("--mailbox");
  await deploy({
    projectDir: resolve(projectDir),
    adbPath: adbFlag !== -1 ? args[adbFlag + 1] : undefined,
    useHost: !noHost,
    mailboxPath: mailboxFlag !== -1 ? args[mailboxFlag + 1] : undefined,
  });
}
