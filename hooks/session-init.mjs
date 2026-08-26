#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureCliReady } from "../cli/bin/bootstrap.js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(process.env.CLAUDE_PLUGIN_ROOT || join(SCRIPT_DIR, ".."));
const CLI_DIR = join(ROOT, "cli");

function isListening(host, port) {
  return new Promise((resolveListening) => {
    const socket = createConnection({ host, port });
    const done = (value) => {
      socket.destroy();
      resolveListening(value);
    };
    socket.setTimeout(500);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

async function startViz() {
  const configured = Object.prototype.hasOwnProperty.call(process.env, "BRIDGE_VIZ_URL")
    ? process.env.BRIDGE_VIZ_URL
    : "http://127.0.0.1:8650";
  if (!configured) return;

  let url;
  try { url = new URL(configured); } catch { return; }
  if (!new Set(["127.0.0.1", "localhost", "::1"]).has(url.hostname)) return;
  const port = Number(url.port || 8650);
  if (await isListening(url.hostname, port)) return;

  const entry = join(ROOT, "viz", "run.mjs");
  if (!existsSync(entry)) return;
  const child = spawn(process.execPath, [entry, "--port", String(port)], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  console.log(`[bridge] visualization: ${url.origin}/pipeline.html`);
}

async function main() {
  console.log(`[bridge] session-init at ${ROOT}`);
  ensureCliReady(CLI_DIR);
  await startViz();
  console.log("[bridge] ready");
}

main().catch((error) => {
  console.error(`[bridge] session-init failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
