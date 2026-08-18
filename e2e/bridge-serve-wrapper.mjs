#!/usr/bin/env node
/**
 * bridge-serve-wrapper — BRIDGE serve 的透明代理 + 断线自愈。
 *
 * 车热点 adb IP 每次重连都会漂移 (car_invoke.sh 靠 DNS 探测)。MCP stdio server 的
 * --device 是启动时固定的, 掉线后 invoke 全部失败。这个 wrapper:
 *   1. 启动时探测热点 DNS IP → adb connect → spawn 真正的 serve (--device <IP>);
 *   2. 每 15s 检查 adb devices, 设备不在 → 杀掉 serve 子进程 → 重新探测 IP → 重启 serve;
 *   3. 作为 stdio 透明代理: gateway 通过本进程的 stdin/stdout 与 serve 通信, 重启对上层透明。
 *
 * 用法(替代 config 里的 serve args):
 *   node D:/IM/mcp-gateway/bridge-serve-wrapper.mjs \
 *     -- C:/Users/.../mcp-pipeline.js serve --analysis D:/IM/mcp-gateway/bridge-analysis.json --timeout 20000
 */
import { spawn } from "child_process";
import { execFileSync } from "child_process";

const ADB = process.platform === "win32" ? "adb.exe" : "adb";
const DEVICE_RE = /^[0-9.]+:\d+$/;

/** 车机热点 IP 应是私有网段 (10/8, 172.16/12, 192.168/16) — 排除校园网/公网 DNS */
function isPrivateIp(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function detectCarIp() {
  try {
    // 与 car_invoke.sh 同款: 车热点下, 车机 IP = WLAN 的 DNS server
    const out = execFileSync("powershell.exe", [
      "-NoProfile", "-Command",
      "(Get-DnsClientServerAddress -AddressFamily IPv4 -InterfaceAlias 'WLAN' | Select-Object -First 1).ServerAddresses[0]",
    ], { encoding: "utf8", timeout: 15000 });
    const ip = out.trim();
    if (DEVICE_RE.test(`${ip}:5555`) && isPrivateIp(ip)) return ip;
  } catch { /* fallthrough */ }
  return null;
}

function adbDevices() {
  try {
    const out = execFileSync(ADB, ["devices"], { encoding: "utf8", timeout: 10000 });
    return new Set(out.split(/\r?\n/).filter((l) => l.includes("\tdevice")).map((l) => l.split("\t")[0]));
  } catch { return new Set(); }
}

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
  const ip = detectCarIp();
  if (!ip) {
    console.error(`[bridge-serve-wrapper] no car hotspot (WLAN DNS not a device IP) — retrying in 10s`);
    return;
  }
  const serial = `${ip}:5555`;
  try { execFileSync(ADB, ["connect", serial], { timeout: 15000 }); } catch { /* connect fails — retry next cycle */ }
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
  const devices = adbDevices();
  const alive = serveProc && serveProc.exitCode === null && currentSerial && devices.has(currentSerial);
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
