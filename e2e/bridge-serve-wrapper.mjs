#!/usr/bin/env node
/**
 * bridge-serve-wrapper — BRIDGE serve 的透明代理 + 断线自愈。
 *
 * 车热点 adb IP 每次重连都会漂移。MCP stdio server 的
 * --device 是启动时固定的, 掉线后 invoke 全部失败。这个 wrapper:
 *   1. 优先使用 BRIDGE_DEVICE/已连接设备，再探测当前热点路由 → spawn 真正的 serve;
 *   2. 每 15s 检查 adb devices, 设备不在 → 杀掉 serve 子进程 → 重新探测 IP → 重启 serve;
 *   3. 代理 stdio: gateway 通过本进程的 stdin/stdout 与 serve 通信。子进程重启后调用方应重新连接。
 *
 * 用法(替代 config 里的 serve args):
 *   cd e2e
 *   node bridge-serve-wrapper.mjs \
 *     -- ../cli/bin/mcp-pipeline.js serve --analysis bridge-analysis.json --timeout 20000
 */
import { spawn } from "child_process";
import { discoverAdbDevice, isAdbDeviceOnline, resolveAdbBinary } from "./device-discovery.mjs";

const ADB = resolveAdbBinary();

let serveProc = null;
let currentSerial = null;
let restarting = false;

function stopServe() {
  if (serveProc) {
    try { serveProc.kill(); } catch { /* best effort */ }
    serveProc = null;
  }
}

function startServe(baseArgs) {
  stopServe();
  const device = discoverAdbDevice(ADB);
  if (!device) {
    console.error("[bridge-serve-wrapper] no unique adb device; connect one or set BRIDGE_DEVICE — retrying");
    return;
  }
  const serial = device.serial;
  currentSerial = serial;
  console.error(`[bridge-serve-wrapper] serve -> ${serial}`);
  serveProc = spawn("node", [...baseArgs, "--device", serial], { stdio: ["pipe", "pipe", "inherit"] });
  serveProc.stdin.on("error", () => {});
  serveProc.stdout.on("error", () => {});
  process.stdin.pipe(serveProc.stdin);
  serveProc.stdout.pipe(process.stdout);
  serveProc.on("exit", (code) => {
    console.error(`[bridge-serve-wrapper] serve exited (${code})`);
    if (serveProc) serveProc = null; // killed by us → restart via watchdog
  });
}

const sep = process.argv.indexOf("--");
const baseArgs = sep >= 0 ? process.argv.slice(sep + 1) : [];
if (baseArgs.length === 0) {
  console.error("usage: bridge-serve-wrapper.mjs -- <serve cmd args...>");
  process.exit(1);
}

startServe(baseArgs);

setInterval(() => {
  const alive = serveProc && serveProc.exitCode === null && currentSerial && isAdbDeviceOnline(currentSerial, ADB);
  if (!alive) {
    if (!restarting) {
      restarting = true;
      console.error(`[bridge-serve-wrapper] device ${currentSerial ?? "?"} lost — restarting serve`);
      startServe(baseArgs);
    }
  } else {
    restarting = false;
  }
}, 15000);

process.on("SIGINT", () => { stopServe(); process.exit(0); });
process.on("SIGTERM", () => { stopServe(); process.exit(0); });
