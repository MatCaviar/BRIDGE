#!/usr/bin/env node
/**
 * bridge-ui — host-side MCP server for APP-UI driving capabilities (app-type abilities).
 *
 * The BRIDGE executor covers binder-contract tools (imaudio execmd, mapnav, carcontrol, media).
 * Apps whose behavior is only reachable through their UI (taps/swipes) need a different path:
 * this server drives the car's UI over adb — `uiautomator dump` to discover widgets, `input tap`
 * to click. It is app-agnostic: any app, any screen, driven by text labels. The LLM uses it like
 * a human: look at the screen (ui_dump) and tap what it sees (ui_tap_text).
 *
 * Device serial is auto-detected (car hotspot DNS = private-IP WLAN DNS) and re-validated on
 * every call (hotspot reconnects change the IP / adbd may restart). Override with env BRIDGE_DEVICE.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn, execFileSync } from "child_process";

const ADB = process.platform === "win32" ? "adb.exe" : "adb";

/** 动态探测车热点 IP(私有网段) — 热点重连 IP 会漂移, 不能写死 */
let DEVICE = process.env.BRIDGE_DEVICE || "";
function isPrivateIp(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return false;
  const [a, b] = p;
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
function detectDevice() {
  try {
    const out = execFileSync("powershell.exe", [
      "-NoProfile", "-Command",
      "(Get-DnsClientServerAddress -AddressFamily IPv4 -InterfaceAlias 'WLAN' | Select-Object -First 1).ServerAddresses[0]",
    ], { encoding: "utf8", timeout: 10000 });
    const ip = out.trim();
    if (isPrivateIp(ip)) {
      const serial = `${ip}:5555`;
      try { execFileSync(ADB, ["connect", serial], { timeout: 10000 }); } catch { /* next call retries */ }
      return serial;
    }
  } catch { /* no hotspot */ }
  return "";
}
function adbHas(serial) {
  try {
    const out = execFileSync(ADB, ["devices"], { encoding: "utf8", timeout: 8000 });
    return out.split(/\r?\n/).some((l) => l.includes(serial) && l.includes("device") && !l.includes("offline"));
  } catch { return false; }
}
function ensureDevice() {
  // 每次调用都验证: 缓存 IP 不在线(热点重连 IP 漂移/adbd 重启) → 强制重新探测
  if (DEVICE && adbHas(DEVICE)) return DEVICE;
  DEVICE = detectDevice();
  return DEVICE;
}

function runAdb(args) {
  return new Promise((resolve, reject) => {
    const serial = ensureDevice();
    if (!serial) return reject(new Error("no car hotspot (WLAN DNS not a device IP)"));
    const p = spawn(ADB, ["-s", serial, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("error", (e) => reject(new Error(`adb spawn failed: ${e.message}`)));
    p.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`adb ${args[0]} exit ${code}: ${out.slice(0, 300)}`))));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function runAdbExecOut(args) {
  return new Promise((resolve, reject) => {
    const serial = ensureDevice();
    if (!serial) return reject(new Error("no car hotspot"));
    const p = spawn(ADB, ["-s", serial, ...args], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const chunks = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("error", (e) => reject(new Error(`adb spawn failed: ${e.message}`)));
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`adb ${args[0]} exit ${code}`))));
  });
}

/** 屏名(DRIVER/PASSENGER/REAR 等)→ displayId(DisplayManager 按名包含匹配; 失败 -1 回退当前屏) */
async function resolveDisplay(name) {
  try {
    const out = await runAdb(["shell", "dumpsys display 2>/dev/null"]);
    const ents = out.match(/DisplayDeviceInfo\{[^}]*\}/g) ?? [];
    for (const ent of ents) {
      if (ent.toUpperCase().includes(name.toUpperCase())) {
        const idm = ent.match(/displayId=(\d+)/) ?? ent.match(/mDisplayId=(\d+)/);
        if (idm) return Number(idm[1]);
      }
    }
  } catch { /* ignore */ }
  return -1;
}

/** MCP 标准返回: { content: [{type:"text", text}] } — 裸对象会让客户端 content 为空 */
function mcpResult(data) {
  return { content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data) }] };
}

/** Dump the UI tree (uiautomator) and return [text + content-desc + bounds] rows.
 *  uiautomator dump 在 app 刚启动(idle 未就绪)时会失败 — 重试几次。 */
async function dumpUi() {
  let xml = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await runAdb(["shell", "rm -f /sdcard/ui_dump.xml"]);
      const dumpOut = await runAdb(["shell", "uiautomator dump /sdcard/ui_dump.xml"]);
      if (/ERROR/i.test(dumpOut) && !/dumped/i.test(dumpOut)) throw new Error(dumpOut.slice(0, 120));
      // exec-out: binary-safe (adb.exe converts stdout to console codepage on Windows pipes → 中文乱码)
      const buf = await runAdbExecOut(["exec-out", "cat /sdcard/ui_dump.xml"]);
      xml = buf.toString("utf8");
      if (xml.includes("<node")) break;
    } catch (e) {
      xml = "";
    }
    await sleep(1200);
  }
  const rows = [];
  const re = /<node[^>]*>/g;
  let m;
  while ((m = re.exec(xml))) {
    const n = m[0];
    const text = /text="([^"]*)"/.exec(n)?.[1] ?? "";
    const desc = /content-desc="([^"]*)"/.exec(n)?.[1] ?? "";
    const clickable = /clickable="true"/.test(n);
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(n);
    if (!b) continue;
    const label = text || desc;
    if (!label) continue;
    rows.push({
      label,
      clickable,
      x: Math.round((+b[1] + +b[3]) / 2),
      y: Math.round((+b[2] + +b[4]) / 2),
    });
  }
  return rows;
}

const server = new McpServer({ name: "bridge-ui", version: "1.0.0" });

server.registerTool(
  "geo_search",
  {
    description: "把中文地点名解析为经纬度(联网地理编码, Photon/OSM)。导航前若不确定目的地坐标, 先调用它获取 lat/lon 再传给 nav_start。",
    inputSchema: { name: z.string().describe("地点名称, 如 上海虹桥机场 / 杭州西湖") },
  },
  async ({ name }) => {
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(name)}&limit=3`;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch(url, { headers: { "User-Agent": "bridge-e2e/1.0" }, signal: ctrl.signal });
      clearTimeout(timer);
      const data = await resp.json();
      const results = (data.features || []).map((f) => ({
        name: f.properties?.name ?? "",
        region: [f.properties?.city, f.properties?.state].filter(Boolean).join(" "),
        lat: f.geometry?.coordinates?.[1] ?? 0,
        lon: f.geometry?.coordinates?.[0] ?? 0,
      }));
      return mcpResult({ results });
    } catch (e) {
      return mcpResult({ results: [], error: String(e) });
    }
  }
);

server.registerTool(
  "ui_launch",
  {
    description: "启动车机 app 或直达其页面(deep link)。用户说'打开XX'时用。三种方式: pkg+uri(deep link, 如 imaudio://soundeffects/boeffects) / pkg+activity(组件) / 仅 pkg(主入口)。可选 extras 传附加字符串参数。",
    inputSchema: {
      pkg: z.string().describe("app 包名, 如 com.immotors.imaudio / com.ebanma.map.main / cn.alios.audioapp.qq"),
      activity: z.string().optional().describe("Activity 全名, 省略则解析主入口"),
      uri: z.string().optional().describe("deep link URI(优先于 activity), 如 imaudio://soundeffects/boeffects"),
      action: z.string().optional().describe("intent action(目标服务要求匹配 action 时传, 优先于 uri)"),
      extras: z.record(z.string()).optional().describe("附加字符串 extras, 如 {\"ToCarControl\": \"{\\\"type\\\":\\\"air\\\"}\"}"),
      display: z.string().optional().describe("目标屏 DRIVER/PASSENGER/REAR(按 DisplayManager 名匹配, 失败回退当前屏)"),
    },
  },
  async ({ pkg, activity, uri, action, extras, display }) => {
    let am = "am start --user 10";
    if (action) {
      am += ` -a ${action}`;
      if (uri) am += ` -d ${uri}`;
      if (pkg && activity) am += ` -n ${pkg}/${activity}`;
    } else if (uri) {
      // deep link: ACTION_VIEW + uri (+包限定)
      am += ` -a android.intent.action.VIEW -d ${uri}`;
      if (pkg) am += ` -p ${pkg}`;
    } else {
      let comp = activity ? `${pkg}/${activity}` : pkg;
      if (!activity) {
        try {
          const out = await runAdb(["shell", `cmd package resolve-activity --brief ${pkg}`]);
          const line = out.trim().split(/\r?\n/).filter((l) => l.includes("/")).pop();
          if (line) comp = line.trim();
        } catch { /* keep pkg form */ }
      }
      am += ` -n ${comp}`;
    }
    if (extras) {
      for (const [k, v] of Object.entries(extras)) am += ` --es ${k} ${JSON.stringify(String(v))}`;
    }
    if (display) {
      const dispId = await resolveDisplay(display);
      if (dispId >= 0) am += ` --display ${dispId}`;
    }
    await runAdb(["shell", am]).catch(() => {});
    await sleep(2500);
    return mcpResult({ ok: true, launched: am });
  }
);

server.registerTool(
  "ui_dump",
  {
    description: "读取车机当前屏幕的 UI 控件列表(文本+可点击+坐标)。在点击/操作前先用它看界面。",
    inputSchema: {},
  },
  async () => {
    const rows = await dumpUi();
    return mcpResult({ widgets: rows });
  }
);

server.registerTool(
  "ui_tap_text",
  {
    description: "按文本点击车机屏幕上的控件(自动在 UI 树里找文本并点击中心点)。如点'专业听音室''开始导航''设置'。若界面上没有该文本会失败, 可先 ui_dump 查看。",
    inputSchema: {
      text: z.string().describe("要点击的控件文本或 content-desc"),
    },
  },
  async ({ text }) => {
    const rows = await dumpUi();
    const hit = rows.find((r) => r.label.includes(text));
    if (!hit) {
      return mcpResult({ ok: false, error: `未找到文本 "${text}"`, available: rows.map((r) => r.label).slice(0, 30) });
    }
    await runAdb(["shell", `input tap ${hit.x} ${hit.y}`]);
    await sleep(1500);
    return mcpResult({ ok: true, tapped: hit.label, at: [hit.x, hit.y] });
  }
);

server.registerTool(
  "ui_tap",
  {
    description: "按坐标点击车机屏幕(x y 为屏幕像素坐标)。一般用 ui_tap_text 更可靠, 此工具用于特殊位置。",
    inputSchema: { x: z.number(), y: z.number() },
  },
  async ({ x, y }) => {
    await runAdb(["shell", `input tap ${x} ${y}`]);
    await sleep(1500);
    return mcpResult({ ok: true, at: [x, y] });
  }
);

server.registerTool(
  "ui_swipe",
  {
    description: "在车机屏幕上滑动(如翻页/拖动滑条)。",
    inputSchema: {
      x1: z.number(), y1: z.number(),
      x2: z.number(), y2: z.number(),
      duration: z.number().optional().describe("滑动时长 ms, 默认 500"),
    },
  },
  async ({ x1, y1, x2, y2, duration }) => {
    await runAdb(["shell", `input swipe ${x1} ${y1} ${x2} ${y2} ${duration ?? 500}`]);
    await sleep(1000);
    return mcpResult({ ok: true, from: [x1, y1], to: [x2, y2] });
  }
);

server.registerTool(
  "ui_back",
  {
    description: "返回键(回到上一页)。",
    inputSchema: {},
  },
  async () => {
    await runAdb(["shell", "input keyevent 4"]);
    await sleep(1000);
    return mcpResult({ ok: true });
  }
);

server.registerTool(
  "ui_home",
  {
    description: "回到车机桌面。",
    inputSchema: {},
  },
  async () => {
    await runAdb(["shell", "input keyevent 3"]);
    await sleep(1000);
    return mcpResult({ ok: true });
  }
);

await server.connect(new StdioServerTransport());
