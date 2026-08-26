import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function resolveAdbBinary() {
  if (process.env.BRIDGE_ADB?.trim()) return process.env.BRIDGE_ADB.trim();
  const bundled = join(ROOT, "tools", "adb", "adb.exe");
  if (process.platform === "win32" && existsSync(bundled)) return bundled;
  return process.platform === "win32" ? "adb.exe" : "adb";
}

function exec(adb, args, timeout = 10000) {
  try {
    return execFileSync(adb, args, { encoding: "utf8", timeout, windowsHide: true }).trim();
  } catch {
    return "";
  }
}

export function connectedAdbDevices(adb = resolveAdbBinary()) {
  return exec(adb, ["devices"])
    .split(/\r?\n/)
    .map((line) => line.match(/^(\S+)\s+device$/)?.[1])
    .filter(Boolean);
}

export function isAdbDeviceOnline(serial, adb = resolveAdbBinary()) {
  return connectedAdbDevices(adb).includes(serial);
}

function isPrivateIpv4(ip) {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function normalizeSerial(value) {
  const serial = value.trim();
  return isPrivateIpv4(serial) ? `${serial}:5555` : serial;
}

function windowsCandidates() {
  const script = [
    "$items = Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' }",
    "$items | ForEach-Object {",
    "  if ($_.IPv4DefaultGateway) { $_.IPv4DefaultGateway.NextHop }",
    "  if ($_.DNSServer) { $_.DNSServer.ServerAddresses }",
    "}",
  ].join("; ");
  try {
    return execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      encoding: "utf8", timeout: 12000, windowsHide: true,
    }).split(/\r?\n/).map((line) => line.trim()).filter(isPrivateIpv4);
  } catch {
    return [];
  }
}

function unixCandidates() {
  const candidates = [];
  const commands = process.platform === "darwin"
    ? [["route", ["-n", "get", "default"]], ["scutil", ["--dns"]]]
    : [["ip", ["route", "show", "default"]]];
  for (const [command, args] of commands) {
    try {
      const out = execFileSync(command, args, { encoding: "utf8", timeout: 8000 });
      candidates.push(...(out.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []));
    } catch { /* optional system command */ }
  }
  if (process.platform !== "win32") {
    try {
      const resolv = readFileSync("/etc/resolv.conf", "utf8");
      candidates.push(...[...resolv.matchAll(/^nameserver\s+([^\s#]+)/gm)].map((match) => match[1]));
    } catch { /* optional file */ }
  }
  return candidates.filter(isPrivateIpv4);
}

function probe(adb, serial) {
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(serial)) exec(adb, ["connect", serial], 12000);
  const model = exec(adb, ["-s", serial, "shell", "getprop", "ro.product.model"], 6000);
  return model ? { serial, model } : null;
}

export function discoverAdbDevice(adb = resolveAdbBinary()) {
  const preferred = process.env.BRIDGE_DEVICE?.trim();
  if (preferred) return probe(adb, normalizeSerial(preferred));

  const connected = connectedAdbDevices(adb);
  if (connected.length === 1) return probe(adb, connected[0]);
  if (connected.length > 1) return null;

  const candidates = process.platform === "win32" ? windowsCandidates() : unixCandidates();
  for (const ip of [...new Set(candidates)]) {
    const hit = probe(adb, `${ip}:5555`);
    if (hit) return hit;
  }
  return null;
}
