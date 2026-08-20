#!/usr/bin/env node
/**
 * BRIDGE 管线可视化 · 实时模式后端（零依赖）
 *
 * 静态服务 viz/ 目录 + 管线阶段执行 API。页面「实时」模式通过本服务
 * 逐阶段执行真实命令（validate / registry 生成 / 部署 / serve / carcheck / invoke）。
 *
 * 用法: node viz/run.mjs [--port 8650]
 * 然后浏览器打开 http://127.0.0.1:8650/pipeline.html 切「实时」模式。
 *
 * API:
 *   GET  /api/health         存活 + 服务信息
 *   GET  /api/state          当前状态（车 IP / serve 运行 / 日志尾）
 *   POST /api/stage          执行阶段 {stage, args}
 *       stage: validate | registry | deploy | serve:start | serve:stop | carcheck | invoke
 *   其余 GET 请求 → 静态文件（viz/ 目录，默认 pipeline.html）
 *
 * 安全：仅绑定 127.0.0.1 本地回环；车端操作（deploy/invoke）会真动车，页面侧有护栏。
 */
import { createServer } from "http";
import { spawn, execFile } from "child_process";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIZ = join(ROOT, "viz");
const ADB = join(ROOT, "tools", "adb", process.platform === "win32" ? "adb.exe" : "adb");
const CLI = join(ROOT, "cli", "bin", "mcp-pipeline.js");
const ANALYSIS = join(ROOT, "e2e", "bridge-analysis.json");
const REGISTRY = join(ROOT, "bridge-executor", "registries", "registry.json");
const VALIDATE = join(ROOT, "skills", "bridge-analyze", "validate-analysis.mjs");
const GEN_REG = join(ROOT, "e2e", "analysis-to-registry.mjs");
const EXEC_PKG = "com.immotors.bridge.executor";
const EXEC_ACT = ".ExecutorActivity";

const argPort = process.argv.indexOf("--port");
const PORT = Number(argPort > 0 ? process.argv[argPort + 1] : process.env.PORT || 8650);
const HOST = "127.0.0.1";

const state = { carIp: null, carModel: null, carFailedAt: 0, serveProc: null, serveLog: [] };

/* ---------- 工具 ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd, args, { cwd: ROOT, windowsHide: true, ...opts });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (out += d.toString()));
    const timer = setTimeout(() => { try { p.kill(); } catch (e) {} }, opts.timeout || 60000);
    p.on("close", (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0, code, output: out.trim(), durationMs: Date.now() - t0 });
    });
    p.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, code: -1, output: String(e.message), durationMs: Date.now() - t0 });
    });
  });
}
const adbRun = (args) => run(ADB, args, { timeout: 15000 });
const adbFast = (args) => run(ADB, args, { timeout: 4000 });
const ps = (cmd) =>
  new Promise((resolve) =>
    execFile("powershell.exe", ["-NoProfile", "-Command", cmd], { windowsHide: true },
      (e, stdout) => resolve(e ? "" : String(stdout).trim())));

/* ---------- 车探测（WLAN DNS 优先，网关兜底——本车热点 DNS 转发为公网 DNS） ---------- */
async function probeCandidate(ip) {
  await adbRun(["connect", `${ip}:5555`]);
  await sleep(350);
  const r = await adbFast(["-s", `${ip}:5555`, "shell", "getprop ro.product.model"]);
  return r.ok && r.output.trim() ? { ip, model: r.output.trim() } : null;
}
async function detectCar() {
  const candidates = [];
  const dns = await ps("(Get-DnsClientServerAddress -AddressFamily IPv4 -InterfaceAlias 'WLAN' | Select-Object -First 1).ServerAddresses[0]");
  if (dns) candidates.push(dns);
  const gw = await ps("(Get-NetRoute -DestinationPrefix '0.0.0.0/0' | Where-Object {$_.InterfaceAlias -eq 'WLAN'} | Select-Object -First 1).NextHop");
  if (gw && !candidates.includes(gw)) candidates.push(gw);
  const hits = await Promise.all(candidates.map(probeCandidate)); // 并行探测
  const hit = hits.find(Boolean);
  if (hit) {
    state.carIp = hit.ip;
    state.carModel = hit.model;
    state.carFailedAt = 0;
    return { ok: true, carIp: hit.ip, carModel: hit.model };
  }
  return { ok: false, error: "车离线（未在 WLAN DNS/网关发现 adb 设备）" };
}
async function requireCar() {
  if (state.carIp) return { ok: true, carIp: state.carIp, carModel: state.carModel };
  // 失败缓存 30s，避免多个阶段重复慢探测
  if (state.carFailedAt && Date.now() - state.carFailedAt < 30000) {
    return { ok: false, error: "车离线（30s 内已探测）", carIp: null };
  }
  const d = await detectCar();
  if (!d.ok) state.carFailedAt = Date.now();
  return d;
}
async function currentUser(ip) {
  const r = await adbRun(["-s", `${ip}:5555`, "shell", "am get-current-user"]);
  return r.ok ? r.output.trim() : "10";
}

/* ---------- 阶段执行 ---------- */
async function stageAnalyze() {
  const a = JSON.parse(readFileSync(ANALYSIS, "utf-8"));
  const caps = a.capabilities || [];
  const byStatus = {}, byMech = {};
  for (const c of caps) {
    byStatus[c.status || "probe"] = (byStatus[c.status || "probe"] || 0) + 1;
    const m = c.mechanism || "execmd";
    byMech[m] = (byMech[m] || 0) + 1;
  }
  const active = caps.filter((c) => c.status !== "broken").length;
  return {
    ok: true,
    output: `载入 ${ANALYSIS.replace(/\\/g, "/")}\n` +
      `app: ${JSON.stringify(a.app || {})}\n` +
      `capabilities: ${caps.length} (verified ${byStatus.verified || 0} · broken ${byStatus.broken || 0})\n` +
      `机制分布: ${Object.entries(byMech).map(([m, n]) => `${m} ${n}`).join(" · ")}\n` +
      `serve 工具面: ${active + 4} = ${active} + 4 media\n` +
      `（描述撰写为 agent 判断；此处载入已产出之真相源并结构化检视）`,
  };
}
async function stageValidate() {
  return run(process.execPath, [VALIDATE, ANALYSIS]);
}
async function stageRegistry() {
  return run(process.execPath, [GEN_REG, ANALYSIS, REGISTRY]);
}
async function stageDeploy() {
  const car = await requireCar();
  if (!car.ok) return { ok: false, error: car.error };
  const U = await currentUser(car.carIp);
  const owner = `u${U}_a206`;
  const fdir = `/data/user/${U}/${EXEC_PKG}/files`;
  const a = await adbRun(["push", REGISTRY, "/data/local/tmp/__reg.json"]);
  if (!a.ok) return { ok: false, error: `adb push 失败: ${a.output.slice(-160)}` };
  const b = await adbRun(["-s", `${car.carIp}:5555`, "shell",
    `cp /data/local/tmp/__reg.json ${fdir}/registry.json && chown ${owner}:${owner} ${fdir}/registry.json && chmod 666 ${fdir}/registry.json && echo deployed`]);
  if (!b.ok || !b.output.includes("deployed")) return { ok: false, error: `部署失败: ${(b.output || "").slice(-160)}` };
  return { ok: true, output: `deployed → ${fdir}/registry.json (车 ${car.carIp}:5555)` };
}
async function stageServeStart(args) {
  if (state.serveProc) return { ok: true, output: "serve 已在运行", already: true };
  // serve 启动只注册工具面（31 tools），--device 仅在 tools/call 时才连车；
  // 故 MCP server 生成不依赖车在线。默认用占位设备串。
  const device = (args && args.device) || "viz-no-car";
  const p = spawn(process.execPath, [CLI, "serve", "--analysis", ANALYSIS, "--device", device],
    { cwd: ROOT, windowsHide: true });
  state.serveProc = p;
  state.serveLog = [];
  p.stdout.on("data", (d) => pushServeLog(d.toString()));
  p.stderr.on("data", (d) => pushServeLog(d.toString()));
  p.on("close", (code) => { pushServeLog(`[serve 进程退出 code=${code}]`); state.serveProc = null; });
  await sleep(1300);
  if (!state.serveProc) return { ok: false, error: `serve 启动即退出: ${state.serveLog.join(" ").slice(-240)}` };
  return { ok: true, output: `serve 已启动（pid ${p.pid}，--device ${device}）\nMCP Server 就绪，工具面 31 tools 注册（broken 2 略过 + media 内置 4）\n${state.serveLog.slice(0, 6).join("\n")}` };
}
function pushServeLog(s) {
  s.split("\n").filter(Boolean).slice(-20).forEach((l) => {
    state.serveLog.push(l);
    if (state.serveLog.length > 200) state.serveLog.splice(0, state.serveLog.length - 200);
  });
}
async function stageServeStop() {
  if (!state.serveProc) return { ok: true, output: "serve 未在运行" };
  try { state.serveProc.kill(); } catch (e) {}
  state.serveProc = null;
  return { ok: true, output: "serve 已停止" };
}
async function stageCarcheck() {
  const car = await requireCar();
  if (!car.ok) return { ok: false, error: car.error };
  return { ok: true, output: `车在线 ${car.carIp}:5555 · model ${car.carModel}` };
}
async function stageInvoke(args) {
  const op = args.op || "";
  if (!op) return { ok: false, error: "缺少 op" };
  const car = await requireCar();
  if (!car.ok) return { ok: false, error: car.error };
  const U = await currentUser(car.carIp);
  const owner = `u${U}_a206`;
  const fdir = `/data/user/${U}/${EXEC_PKG}/files`;
  const reqId = `rt${Date.now()}`;
  writeFileSync(join(ROOT, "viz", ".cmd.json"),
    JSON.stringify({ reqId, op, args: args.args || {} }));
  const a = await adbRun(["push", join(ROOT, "viz", ".cmd.json"), "/data/local/tmp/__rt_cmd.json"]);
  if (!a.ok) return { ok: false, error: `adb push 失败: ${a.output.slice(-120)}` };
  const b = await adbRun(["-s", `${car.carIp}:5555`, "shell",
    `cp /data/local/tmp/__rt_cmd.json ${fdir}/imrpc/cmd.json && chown ${owner}:${owner} ${fdir}/imrpc/cmd.json && chmod 660 ${fdir}/imrpc/cmd.json && rm -f ${fdir}/imrpc/result.json`]);
  if (!b.ok) return { ok: false, error: "写入车端信箱失败" };
  await adbRun(["-s", `${car.carIp}:5555`, "shell", "am start --user", U, "-n", `${EXEC_PKG}/${EXEC_ACT}`]);
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    await sleep(450);
    const c = await adbRun(["-s", `${car.carIp}:5555`, "shell", `cat ${fdir}/imrpc/result.json 2>/dev/null`]);
    const out = c.output.trim();
    if (out) return { ok: true, output: `invoke ${op} → ${out}` };
  }
  return { ok: false, error: `invoke ${op} 超时（9s 无 result）` };
}

const STAGES = {
  analyze: stageAnalyze, validate: stageValidate, registry: stageRegistry, deploy: stageDeploy,
  "serve:start": stageServeStart, "serve:stop": stageServeStop,
  carcheck: stageCarcheck, invoke: stageInvoke,
};

/* ---------- HTTP ---------- */
function serveFile(res, path) {
  const norm = join(VIZ, path);
  if (!norm.startsWith(VIZ)) { res.writeHead(403); return res.end("forbidden"); }
  const target = existsSync(norm) && !existsSync(VIZ + path) ? norm
    : (existsSync(norm) ? norm : join(VIZ, "pipeline.html"));
  try {
    const data = readFileSync(target);
    const ext = target.slice(target.lastIndexOf(".")).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": "no-store" });
    res.end(data);
  } catch (e) { res.writeHead(404); res.end("not found"); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true, name: "bridge-viz-run", port: PORT,
        car: !!state.carIp, serveRunning: !!state.serveProc }));
    }
    if (url.pathname === "/api/state") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ carIp: state.carIp, carModel: state.carModel,
        serveRunning: !!state.serveProc, serveLogTail: state.serveLog.slice(-8) }));
    }
    if (url.pathname === "/api/stage" && req.method === "POST") {
      let body = "";
      for await (const c of req) body += c;
      const { stage, args } = JSON.parse(body || "{}");
      const fn = STAGES[stage];
      if (!fn) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: `未知阶段 ${stage}` })); }
      const r = await fn(args || {});
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: r.ok, stage, output: r.output || "", error: r.error || "", durationMs: r.durationMs || 0 }));
    }
    const path = url.pathname === "/" ? "pipeline.html" : decodeURIComponent(url.pathname.slice(1));
    return serveFile(res, path);
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(e.message) }));
  }
}).listen(PORT, HOST, () => {
  console.log(`BRIDGE 管线可视化 · 实时后端就绪`);
  console.log(`  页面: http://${HOST}:${PORT}/pipeline.html   （切「实时」模式逐阶段执行）`);
  console.log(`  adb: ${ADB}`);
  console.log(`  退出: Ctrl+C`);
});
