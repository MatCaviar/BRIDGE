#!/usr/bin/env node
/**
 * 真机通道发现（感知层）——无源码应用的契约发现入口。
 *
 * 用法：node discover-device.mjs [--serial <adb serial>] [--out <dir>]
 *
 * 做三件事：
 *   1) 扫描车机全部包名，按关键词（可 --keywords 追加）匹配 8797 应用清单；
 *   2) dumpsys package 逐包提取 exported 服务声明，识别 com.alios.toolsmanager.channel.PROVIDE
 *      通道服务（channelcall-sdk 平台统一契约——所有 8797 应用同一接口）；
 *   3) 产出 channel-manifest.json（发现清单+证据）与 targets.json（桥路由配置，一个 APK 探全部）。
 *
 * 输出（默认 ./discovery/）：
 *   channel-manifest.json  发现结果：每 app 的包名/服务/证据（dumpsys 片段）
 *   targets.json           直接可用于 channel-adapter（推到 assets 重打包，或对照手写）
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SUITE_ROOT = resolve(HERE, "..", "..");
// adb 解析顺序：套件自带 tools/adb → PATH（真机环境常已装）
const BUNDLED_ADB = resolve(SUITE_ROOT, "tools", "adb", process.platform === "win32" ? "adb.exe" : "adb");
const ADB = existsSync(BUNDLED_ADB) ? BUNDLED_ADB : "adb";
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const serial = arg("--serial", "");
const outDir = resolve(arg("--out", resolve(SUITE_ROOT, "discovery")));
const extra = arg("--keywords", "").split(",").filter(Boolean);

// 8797 应用清单（【8797】p3）——名称关键词与候选包名片段；命中即登记
const APPS = [
  { name: "用户手册", zh: ["用户手册", "usermanual", "user_manual"], pkgHints: ["manual"] },
  { name: "设备投屏", zh: ["投屏", "cast", "screen"], pkgHints: ["cast", "screencast"] },
  { name: "应用共看", zh: ["共看", "coview", "co_view"], pkgHints: ["coview"] },
  { name: "IMAudio", zh: ["imaudio"], pkgHints: ["imaudio"] },
  { name: "玩具箱", zh: ["玩具箱", "toybox"], pkgHints: ["toybox", "toy"] },
  { name: "个人中心", zh: ["个人中心", "personal"], pkgHints: ["personal"] },
  { name: "通知中心", zh: ["通知中心", "notification"], pkgHints: ["notification"] },
  { name: "组队", zh: ["组队", "team", "convoy"], pkgHints: ["team", "convoy"] },
  { name: "灯光秀", zh: ["灯光秀", "lightshow", "light_show", "dlp"], pkgHints: ["lightshow", "dlp"] },
  { name: "主题商城", zh: ["主题商城", "theme", "wallpaper"], pkgHints: ["theme"] },
  { name: "我的车", zh: ["我的车", "mycar", "vehicle"], pkgHints: ["mycar", "my_car"] },
  { name: "OMS", zh: ["oms"], pkgHints: ["oms"] },
  ...extra.map((k) => ({ name: k, zh: [k.toLowerCase()], pkgHints: [k.toLowerCase()] })),
];
const PROVIDE_ACTION = "com.alios.toolsmanager.channel.PROVIDE";

const adb = (...args) =>
  execFileSync(ADB, serial ? ["-s", serial, ...args] : args, { encoding: "utf8", timeout: 20000 });

console.log("[1/3] 扫描设备包列表 …");
const devices = adb("devices").split("\n").filter((l) => l.includes("\tdevice"));
if (!devices.length) { console.error("无可用 adb 设备（--serial 指定）"); process.exit(1); }
if (serial) console.log("  目标:", serial);
const packages = adb("shell", "pm", "list", "packages").split("\n")
  .map((l) => l.replace("package:", "").trim()).filter(Boolean);
console.log(`  共 ${packages.length} 个包`);

console.log("[2/3] 匹配 8797 应用 + dumpsys 提取通道服务 …");
const manifest = [];
for (const app of APPS) {
  const hits = packages.filter((p) => {
    const lp = p.toLowerCase();
    return app.zh.some((k) => lp.includes(k)) || app.pkgHints.some((h) => lp.includes(h));
  });
  if (!hits.length) continue;
  for (const pkg of hits) {
    const entry = { app: app.name, package: pkg, services: [], evidence: "" };
    try {
      const dump = adb("shell", "dumpsys", "package", pkg);
      const provideIdx = dump.indexOf(PROVIDE_ACTION);
      if (provideIdx >= 0) {
        entry.evidence = dump.slice(Math.max(0, provideIdx - 400), provideIdx + 200).split("\n").slice(-8).join("\n");
        const serviceRe = /([a-zA-Z0-9_.]+)\s*:[^\n]*exported=true/gs;
        for (const m of dump.matchAll(/([\w.]+Service\d?)\s*\(/g)) {
          if (!entry.services.includes(m[1])) entry.services.push(m[1]);
        }
      }
    } catch (e) { entry.evidence = "dumpsys failed: " + e.message.slice(0, 80); }
    manifest.push(entry);
  }
}

console.log("[3/3] 生成 targets.json（通道路由配置）…");
const targets = {};
for (const e of manifest) {
  const svc = e.services.find((s) => /channel|Channel|Provider/i.test(s));
  if (e.evidence.includes(PROVIDE_ACTION) && svc) {
    const tool = `${e.package.split(".").pop()}_channelCall`;
    targets[tool] = { package: e.package, service: svc, channel: true, app: e.app, discovered: true };
  }
}
mkdirSync(outDir, { recursive: true });
const manifestPath = resolve(outDir, "channel-manifest.json");
writeFileSync(manifestPath, JSON.stringify({ scannedAt: new Date().toISOString(), serial: serial || "default", apps: manifest, provideAction: PROVIDE_ACTION }, null, 1), "utf8");
writeFileSync(resolve(outDir, "targets.json"), JSON.stringify(targets, null, 1), "utf8");

const channelApps = Object.keys(targets).length;
console.log(`\n发现 8797 候选应用 ${new Set(manifest.map((m) => m.app)).size} 个（${manifest.length} 个包），其中带通道服务 ${channelApps} 个`);
for (const [tool, t] of Object.entries(targets)) console.log(`  ✓ ${tool} → ${t.package}/${t.service.split(".").pop()}`);
console.log(`\n产物:\n  ${manifestPath}\n  ${resolve(outDir, "targets.json")}`);
console.log("\n下一步：把 targets.json 合入 channel-adapter/src/main/assets/ 重打包（bash build-apk.sh），或作为校准探测输入（calibrate.mjs）");
