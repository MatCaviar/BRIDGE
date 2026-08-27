#!/usr/bin/env node
/**
 * BRIDGE 管线可视化 · 实时模式后端（零依赖）
 *
 * 静态服务 viz/ 目录 + 管线阶段执行 API。页面「实时」模式通过本服务
 * 逐阶段执行真实命令（validate / function schema / registry / serve / deploy / carcheck / invoke）。
 *
 * 用法: node viz/run.mjs [--port 8650]
 * 然后浏览器打开 http://127.0.0.1:8650/pipeline.html 切「实时」模式。
 *
 * API:
 *   GET  /api/health         存活 + 服务信息
 *   GET  /api/state          当前状态（车 IP / serve 运行 / 日志尾）
 *   POST /api/stage          执行阶段 {stage, args}
 *       stage: validate | schema | registry | deploy | serve:start | serve:stop | carcheck | invoke
 *   其余 GET 请求 → 静态文件（viz/ 目录，默认 pipeline.html）
 *
 * 安全：仅绑定 127.0.0.1 本地回环；车端操作（deploy/invoke）会真动车，页面侧有护栏。
 */
import { createServer } from "http";
import { spawn, execFile } from "child_process";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, basename, resolve } from "path";

const VIZ = dirname(fileURLToPath(import.meta.url));

// POST body 健壮解码: 严格 UTF-8, 失败按 GBK 兜底(Windows 客户端常见), 再失败退 utf-8 宽松
const __utf8Strict = new TextDecoder("utf-8", { fatal: true });
const __gbkDecoder = new TextDecoder("gbk");
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  const buf = Buffer.concat(chunks);
  if (!buf.length) return "";
  try { return __utf8Strict.decode(buf); }
  catch { try { return __gbkDecoder.decode(buf); } catch { return buf.toString("utf-8"); } }
}

const argValue = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const PROJECT_ROOT = resolve(argValue("--project-root") || dirname(VIZ));
const ROOT = resolve(argValue("--suite-root") || process.env.BRIDGE_SUITE_ROOT || PROJECT_ROOT);
const BUNDLED_ADB = join(ROOT, "tools", "adb", "adb.exe");
const ADB = process.env.BRIDGE_ADB ||
  (process.platform === "win32" && existsSync(BUNDLED_ADB) ? BUNDLED_ADB : (process.platform === "win32" ? "adb.exe" : "adb"));
const CLI = join(ROOT, "cli", "bin", "mcp-pipeline.js");
const VALIDATE = join(ROOT, "skills", "bridge-analyze", "validate-analysis.mjs");
const GEN_REG = join(ROOT, "e2e", "analysis-to-registry.mjs");
const EXEC_PKG = process.env.BRIDGE_EXECUTOR_PACKAGE || "com.immotors.bridge.executor";
const EXEC_ACT = process.env.BRIDGE_EXECUTOR_ACTIVITY || ".ExecutorActivity";
const MEDIA_BUILTINS = [
  { id: "media_next", action: "next", description: "Control media playback: next on the active session (切下一首)" },
  { id: "media_prev", action: "prev", description: "Control media playback: prev on the active session (切上一首)" },
  { id: "media_play", action: "play", description: "Control media playback: play on the active session (播放)" },
  { id: "media_pause", action: "pause", description: "Control media playback: pause on the active session (暂停)" },
];

function registryForAnalysis(analysisPath) {
  const dir = dirname(analysisPath);
  const stem = basename(analysisPath, ".json");
  if (stem === "analysis") return join(dir, "registry.json");
  if (stem.startsWith("analysis-")) return join(dir, `registry-${stem.slice("analysis-".length)}.json`);
  return join(dir, `registry-${stem}.json`);
}

function functionSchemaForAnalysis(analysisPath) {
  const dir = dirname(analysisPath);
  const stem = basename(analysisPath, ".json");
  if (stem === "analysis") return join(dir, "function-schema.json");
  if (stem.startsWith("analysis-")) return join(dir, `function-schema-${stem.slice("analysis-".length)}.json`);
  if (stem.endsWith("-analysis")) return join(dir, `${stem.slice(0, -"-analysis".length)}-function-schema.json`);
  return join(dir, `function-schema-${stem}.json`);
}

const analysisArg = argValue("--analysis");
const resolvedAnalysis = analysisArg ? resolve(PROJECT_ROOT, analysisArg) : join(ROOT, "e2e", "bridge-analysis.json");

// 分析目标（可经启动参数或 POST /api/target 切换；套件模式默认使用仓库样例）
let TARGET = {
  analysis: resolvedAnalysis,
  functionSchema: argValue("--function-schema")
    ? resolve(PROJECT_ROOT, argValue("--function-schema"))
    : functionSchemaForAnalysis(resolvedAnalysis),
  registry: argValue("--registry")
    ? resolve(PROJECT_ROOT, argValue("--registry"))
    : (analysisArg ? registryForAnalysis(resolvedAnalysis) : join(ROOT, "bridge-executor", "registries", "registry.json")),
  srcDir: argValue("--src") ? resolve(PROJECT_ROOT, argValue("--src")) : (analysisArg ? PROJECT_ROOT : join(ROOT, "bridge-executor", "src")),
  adapter: argValue("--adapter") ? resolve(PROJECT_ROOT, argValue("--adapter")) : (analysisArg ? PROJECT_ROOT : join(ROOT, "cli", "tests", "fixtures", "imaudio", "IMAudioServiceAdapter.kt")),
};

const PORT = Number(argValue("--port") || process.env.PORT || 8650);
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

/* ---------- 设备探测（显式配置/已连接设备优先，Windows 热点路由兜底） ---------- */
async function probeCandidate(serial) {
  if (/^\d+(?:\.\d+){3}:\d+$/.test(serial)) await adbRun(["connect", serial]);
  await sleep(350);
  const r = await adbFast(["-s", serial, "shell", "getprop ro.product.model"]);
  return r.ok && r.output.trim() ? { serial, model: r.output.trim() } : null;
}
async function detectCar() {
  const candidates = [];
  if (process.env.BRIDGE_DEVICE) candidates.push(process.env.BRIDGE_DEVICE.trim());
  const devices = await adbFast(["devices"]);
  const connected = devices.output.split(/\r?\n/).map((line) => line.match(/^(\S+)\s+device$/)?.[1]).filter(Boolean);
  if (connected.length === 1 && !candidates.includes(connected[0])) candidates.push(connected[0]);
  if (candidates.length === 0 && process.platform === "win32") {
    const network = await ps("$n=Get-NetIPConfiguration|Where-Object{$_.NetAdapter.Status -eq 'Up'};$n|ForEach-Object{if($_.IPv4DefaultGateway){$_.IPv4DefaultGateway.NextHop};if($_.DNSServer){$_.DNSServer.ServerAddresses}}");
    for (const ip of network.split(/\r?\n/).map((v) => v.trim()).filter((v) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v))) {
      const serial = `${ip}:5555`;
      if (!candidates.includes(serial)) candidates.push(serial);
    }
  }
  const hits = await Promise.all(candidates.map(probeCandidate)); // 并行探测
  const hit = hits.find(Boolean);
  if (hit) {
    state.carIp = hit.serial;
    state.carModel = hit.model;
    state.carFailedAt = 0;
    return { ok: true, carIp: hit.serial, carModel: hit.model };
  }
  return { ok: false, error: "未发现唯一 adb 设备（请先 adb connect，或设置 BRIDGE_DEVICE）" };
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
async function currentUser(serial) {
  const r = await adbRun(["-s", serial, "shell", "am get-current-user"]);
  return r.ok ? r.output.trim() : "10";
}

/* ---------- 阶段执行 ---------- */
const read = (p) => { try { return readFileSync(p, "utf-8"); } catch { return ""; } };
const stat = (p) => { try { return statSync(p); } catch { return null; } };
function targetViewData() {
  const analysis = JSON.parse(readFileSync(TARGET.analysis, "utf8"));
  const caps = analysis.capabilities ?? [];
  const active = caps.filter((cap) => cap.status !== "broken");
  const byStatus = {}, byMechanism = {};
  for (const cap of caps) {
    byStatus[cap.status ?? "probe"] = (byStatus[cap.status ?? "probe"] ?? 0) + 1;
    byMechanism[cap.mechanism ?? "execmd"] = (byMechanism[cap.mechanism ?? "execmd"] ?? 0) + 1;
  }
  let registryTools = [];
  try { registryTools = JSON.parse(readFileSync(TARGET.registry, "utf8")).tools ?? []; } catch { /* optional */ }
  let functionSchemas = [];
  try { functionSchemas = JSON.parse(readFileSync(TARGET.functionSchema, "utf8")).functions ?? []; } catch { /* optional */ }
  const registryByMechanism = {};
  for (const tool of registryTools) {
    const mechanism = tool.mechanism ?? "execmd";
    registryByMechanism[mechanism] = (registryByMechanism[mechanism] ?? 0) + 1;
  }
  const activeIds = new Set(active.map((cap) => cap.id));
  const registryIds = new Set(registryTools.map((tool) => tool.id));
  let version = "";
  try { version = JSON.parse(readFileSync(join(ROOT, ".claude-plugin", "plugin.json"), "utf8")).version ?? ""; } catch { /* optional */ }
  return {
    generatedAt: new Date().toISOString(),
    version,
    sources: {
      analysis: TARGET.analysis.replace(/\\/g, "/"),
      functionSchema: TARGET.functionSchema.replace(/\\/g, "/"),
      registry: registryTools.length ? TARGET.registry.replace(/\\/g, "/") : "",
    },
    title: {
      input: `${analysis.app?.name ?? "应用"} ${analysis.app?.framework === "apk-reverse" ? "APK" : "应用源码"}`,
      output: "Agent Functions + MCP 工具套件",
    },
    app: analysis.app ?? {},
    capabilities: caps,
    stats: {
      totalCaps: caps.length,
      verified: byStatus.verified ?? 0,
      probe: byStatus.probe ?? 0,
      broken: byStatus.broken ?? 0,
      active: active.length,
      serveTools: active.length + MEDIA_BUILTINS.length,
      functionSchemas: functionSchemas.length || active.length + MEDIA_BUILTINS.length,
      byMechanism,
      registryTools: registryTools.length,
    },
    registry: {
      present: registryTools.length > 0,
      tools: registryTools.length,
      byMechanism: registryByMechanism,
      missingFromRegistry: [...activeIds].filter((id) => !registryIds.has(id)),
      extraInRegistry: [...registryIds].filter((id) => !activeIds.has(id)),
    },
    mediaBuiltins: MEDIA_BUILTINS,
    probe: { present: false },
  };
}
const extractMethods = (src) =>
  [...src.matchAll(/(?:oneway\s+)?[\w<>\[\].,\s]+\s(\w+)\s*\([^)]*\)\s*(?:throws[\s\w.]*)?;/g)]
    .map((m) => m[1]).filter((v, i, arr) => arr.indexOf(v) === i);
const interfaceMethods = (src) => {
  const m = src.match(/interface\s+\w+[^{]*\{([\s\S]*?)(?:abstract class|$)/);
  return extractMethods(m ? m[1] : src);
};

/** inputs: 盘点 bridge-analyze 的真实输入素材（源码/逆向产物/分析产物） */
async function stageInputs() {
  const items = [
    ["被分析源码（适配器）", TARGET.adapter],
    ["唯一真相源（分析产物）", TARGET.analysis],
    ["执行器契约面", TARGET.srcDir],
    ["车控 handler 映射（逆向产物）", join(ROOT, "tools", "carcontrol_handlers.json")],
    ["车控候选工具（逆向产物）", join(ROOT, "tools", "carcontrol_tools_candidate.json")],
    ["逆向素材说明（dex dump 位置）", join(ROOT, "reverse", "README.md")],
  ];
  const out = [
    `【输入素材盘点】bridge-analyze 输入形态：源码 / PRD / APK / adb 观察`,
    ...items.map(([name, p]) => {
      const s = stat(p);
      if (!s) return `  ${name}: ${p.replace(/\\/g, "/")}（缺失）`;
      const size = s.size > 1024 ? `${(s.size / 1024).toFixed(1)}KB` : `${s.size}B`;
      return `  ${name}: ${p.replace(/\\/g, "/")}（${size}）`;
    }),
    ``,
    `【说明】`,
    `  完整逆向 dex dump（imaudio-dex / map-dex / ccs-dex 等，~1.7GB）不入库；来源与交接位置见 reverse/README.md`,
    `  本阶段为输入盘点（bridge-analyze 输入契约：任意形态）；真正"吃"这些原料的是 ② analyze（源码扫描 + 契约核对）`,
  ].join("\n");
  return { ok: true, output: out };
}

/** analyze: 真源码扫描 + 契约交叉核对（确定性部分；描述撰写为 agent 判断） */
async function stageAnalyze() {
  const a = JSON.parse(readFileSync(TARGET.analysis, "utf-8"));
  const caps = a.capabilities || [];
  const byStatus = {}, byMech = {};
  for (const c of caps) {
    byStatus[c.status || "probe"] = (byStatus[c.status || "probe"] || 0) + 1;
    const m = c.mechanism || "execmd";
    byMech[m] = (byMech[m] || 0) + 1;
  }
  const active = caps.filter((c) => c.status !== "broken").length;

  const SRC = TARGET.srcDir;
  // 契约文件在目标源码树内定向查找（跳过 build/.gradle 等，兼容 executor 布局与真实 app 布局）
  const findIn = (name) => {
    const hits = [];
    const walk = (d) => {
      let entries;
      try { entries = readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const en of entries) {
        if (["build", ".gradle", ".git", "node_modules", ".cxx"].includes(en.name)) continue;
        const p = join(d, en.name);
        if (en.isDirectory()) walk(p);
        else if (en.name === name) hits.push(p);
      }
    };
    try { walk(SRC); } catch (e) {}
    return hits[0] ? read(hits[0]) : "";
  };
  const aidlSrc = findIn("IIMAudioService.aidl");
  const customSrc = findIn("ICustomService.java");
  const mapSrc = findIn("IMapCommonService.java");
  const aidlMethods = extractMethods(aidlSrc);
  const customMethods = interfaceMethods(customSrc);
  const mapMethods = interfaceMethods(mapSrc);
  // 被分析目标源码（bridge-analyze 的 sourceRef 指向处）: 适配器
  const adapterKt = read(TARGET.adapter);
  const adapterMethods = [...adapterKt.matchAll(/fun\s+(\w+)\s*\(/g)].map((m) => m[1]);
  let handlers = [];
  try { handlers = JSON.parse(read(join(ROOT, "tools", "carcontrol_handlers.json"))); } catch (e) {}
  const handlerIds = new Set(handlers.map((h) => h.functionId).filter(Boolean));

  const execmdCaps = caps.filter((c) => c.status !== "broken" && (c.mechanism || "execmd") === "execmd");
  const ccCaps = caps.filter((c) => c.status !== "broken" && c.mechanism === "carcontrol");
  const mapCaps = caps.filter((c) => c.status !== "broken" && c.mechanism === "mapnav");
  const brokenCaps = caps.filter((c) => c.status === "broken");
  const execmdUnmatched = execmdCaps.filter((c) => !adapterMethods.includes(c.methodName)).map((c) => `${c.id}(${c.methodName})`);
  const ccUnmatched = ccCaps.filter((c) => !handlerIds.has(c.ccFunction)).map((c) => `${c.id}(${c.ccFunction})`);
  const mapUnmatched = mapCaps.filter(() => !mapMethods.includes("navigateToForAI")).map((c) => c.id);
  const uncoveredMap = mapMethods.filter((m) => m !== "navigateToForAI");
  const helperFuns = new Set(["registerCallback", "unregisterCallback", "parseRequest", "parseJsonObject", "intArg", "optionalIntArg", "buildResponse"]);
  const analyzedNames = new Set(caps.map((c) => c.methodName).filter(Boolean));
  const uncoveredAdapter = adapterMethods.filter((m) => !analyzedNames.has(m) && !helperFuns.has(m));
  const brokenInAdapter = brokenCaps.filter((c) => adapterMethods.includes(c.methodName)).map((c) => `${c.id}(${c.methodName})`);

  const out = [
    `【载入真相源】${TARGET.analysis.replace(/\\/g, "/")}`,
    `  capabilities: ${caps.length}（verified ${byStatus.verified || 0} · broken ${byStatus.broken || 0}）`,
    `  机制分布: ${Object.entries(byMech).map(([m, n]) => `${m} ${n}`).join(" · ")} · serve 工具面 ${active + 4}`,
    ``,
    `【被分析目标源码（sourceRef 指向）】${TARGET.adapter.replace(/\\/g, "/")}`,
    `  → ${adapterMethods.length} 个 fun（含 ${execmdCaps.length} 个 capability 对应的方法）`,
    ``,
    `【源码契约扫描】${SRC.replace(/\\/g, "/")}`,
    `  IIMAudioService.aidl   → ${aidlMethods.length ? `${aidlMethods.length} 方法: ${aidlMethods.join(" / ")}` : "未找到（目标源码中无此契约）"}`,
    `  ICustomService.java    → ${customMethods.length ? `${customMethods.length} 方法: ${customMethods.join(" / ")}（JSON functionId 路由）` : "未找到（执行器侧契约，目标源码无）"}`,
    `  IMapCommonService.java → ${mapMethods.length ? `${mapMethods.length} 方法: ${mapMethods.join(" / ")}` : "未找到（执行器侧契约，目标源码无）"}`,
    `  carcontrol_handlers.json → ${handlerIds.size} functionId 映射（逆向产物）`,
    ``,
    `【交叉核对】${caps.length} capabilities`,
    `  execmd ${execmdCaps.length}: methodName ∈ 适配器源码 — ${execmdCaps.length - execmdUnmatched.length}/${execmdCaps.length} ✓${execmdUnmatched.length ? ` ✗ ${execmdUnmatched.join("、")}` : ""}（逐名核对源码）`,
    `  carcontrol ${ccCaps.length}: ccFunction ∈ ${handlerIds.size} handlers — ${ccCaps.length - ccUnmatched.length}/${ccCaps.length} ✓${ccUnmatched.length ? ` ✗ ${ccUnmatched.join("、")}` : ""}`,
    `  mapnav ${mapCaps.length}: navigateToForAI ∈ IMapCommonService — ${mapCaps.length - mapUnmatched.length}/${mapCaps.length} ✓`,
    `  broken ${brokenCaps.length}: 方法存在于源码但标记 broken（stub）${brokenInAdapter.length ? `— ${brokenInAdapter.join("、")}` : ""}`,
    ``,
    `【潜在能力面（源码方法未被 analysis 覆盖）】`,
    `  IMapCommonService: ${uncoveredMap.join(" / ") || "（无）"} → 可经 bridge-analyze onboarding`,
    `  IMAudioServiceAdapter: ${uncoveredAdapter.join(" / ") || "（无）"}`,
    `  IIMAudioService: registerCallback / unregisterCallback（内部回调机制）`,
    `  ICustomService: sendMessage / isServiceReady（执行器基础设施）`,
    `（描述撰写为 agent 判断；本阶段执行的是源码扫描 + 契约交叉核对的确定性部分）`,
  ].join("\n");
  return { ok: true, output: out };
}
async function stageValidate() {
  return run(process.execPath, [VALIDATE, TARGET.analysis]);
}
async function stageSchema() {
  return run(process.execPath, [CLI, "schema", "--analysis", TARGET.analysis, "--out", TARGET.functionSchema, "--format", "bridge"]);
}
async function stageRegistry() {
  return run(process.execPath, [GEN_REG, TARGET.analysis, TARGET.registry]);
}
async function stageDeploy() {
  const car = await requireCar();
  if (!car.ok) return { ok: false, error: car.error };
  const U = await currentUser(car.carIp);
  const fdir = `/data/user/${U}/${EXEC_PKG}/files`;
  const a = await adbRun(["push", TARGET.registry, "/data/local/tmp/__reg.json"]);
  if (!a.ok) return { ok: false, error: `adb push 失败: ${a.output.slice(-160)}` };
  const b = await adbRun(["-s", car.carIp, "shell",
    `cp /data/local/tmp/__reg.json ${fdir}/registry.json && chmod 666 ${fdir}/registry.json && echo deployed`]);
  if (!b.ok || !b.output.includes("deployed")) return { ok: false, error: `部署失败: ${(b.output || "").slice(-160)}` };
  return { ok: true, output: `deployed → ${fdir}/registry.json (设备 ${car.carIp})` };
}
async function stageServeStart(args) {
  if (state.serveProc) return { ok: true, output: "serve 已在运行", already: true };
  const analysis = JSON.parse(readFileSync(TARGET.analysis, "utf8"));
  const active = (analysis.capabilities ?? []).filter((c) => c.status !== "broken").length;
  const serveTools = active + MEDIA_BUILTINS.length;
  // serve 启动只注册工具面，--device 仅在 tools/call 时才连车；
  // 故 MCP server 生成不依赖车在线。默认用占位设备串。
  const device = (args && args.device) || "viz-no-car";
  const p = spawn(process.execPath, [CLI, "serve", "--analysis", TARGET.analysis, "--device", device],
    { cwd: ROOT, windowsHide: true });
  state.serveProc = p;
  state.serveLog = [];
  p.stdout.on("data", (d) => pushServeLog(d.toString()));
  p.stderr.on("data", (d) => pushServeLog(d.toString()));
  p.on("close", (code) => { pushServeLog(`[serve 进程退出 code=${code}]`); state.serveProc = null; });
  await sleep(1300);
  if (!state.serveProc) return { ok: false, error: `serve 启动即退出: ${state.serveLog.join(" ").slice(-240)}` };
  return { ok: true, output: `serve 已启动（pid ${p.pid}，--device ${device}）\nMCP Server 就绪，工具面 ${serveTools} tools 注册（active ${active} + media 内置 4）\n${state.serveLog.slice(0, 6).join("\n")}` };
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
  return { ok: true, output: `设备在线 ${car.carIp} · model ${car.carModel}` };
}
async function stageInvoke(args) {
  const op = args.op || "";
  if (!op) return { ok: false, error: "缺少 op" };
  const car = await requireCar();
  if (!car.ok) return { ok: false, error: car.error };
  const U = await currentUser(car.carIp);
  const fdir = `/data/user/${U}/${EXEC_PKG}/files`;
  const reqId = `rt${Date.now()}`;
  writeFileSync(join(ROOT, "viz", ".cmd.json"),
    JSON.stringify({ reqId, op, args: args.args || {} }));
  const a = await adbRun(["push", join(ROOT, "viz", ".cmd.json"), "/data/local/tmp/__rt_cmd.json"]);
  if (!a.ok) return { ok: false, error: `adb push 失败: ${a.output.slice(-120)}` };
  const b = await adbRun(["-s", car.carIp, "shell",
    `cp /data/local/tmp/__rt_cmd.json ${fdir}/imrpc/cmd.json && chmod 666 ${fdir}/imrpc/cmd.json && rm -f ${fdir}/imrpc/result.json`]);
  if (!b.ok) return { ok: false, error: "写入车端信箱失败" };
  await adbRun(["-s", car.carIp, "shell", "am start --user", U, "-n", `${EXEC_PKG}/${EXEC_ACT}`]);
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) {
    await sleep(450);
    const c = await adbRun(["-s", car.carIp, "shell", `cat ${fdir}/imrpc/result.json 2>/dev/null`]);
    const out = c.output.trim();
    if (out) return { ok: true, output: `invoke ${op} → ${out}` };
  }
  return { ok: false, error: `invoke ${op} 超时（9s 无 result）` };
}

const STAGES = {
  inputs: stageInputs, analyze: stageAnalyze, validate: stageValidate, schema: stageSchema, registry: stageRegistry, deploy: stageDeploy,
  "serve:start": stageServeStart, "serve:stop": stageServeStop,
  carcheck: stageCarcheck, invoke: stageInvoke,
};

/* ---------- 运行会话（服务端持有，刷新页面不丢进度） ---------- */
const SESSION_STAGES = ["n1", "n2", "n3", "n4a", "n4b", "n5", "n6"];
const session = { name: "", startedAt: 0, stages: {}, log: [], runToken: 0 };
function sessReset(name) {
  session.name = name || "";
  session.startedAt = Date.now();
  session.stages = {};
  session.log = [];
  for (const s of SESSION_STAGES) session.stages[s] = "pending";
}
function sessLog(stage, cls, msg) {
  const t = session.startedAt ? ((Date.now() - session.startedAt) / 1000).toFixed(1) : "0.0";
  session.log.push({ t, stage: stage || "", cls: cls || "", msg });
  if (session.log.length > 600) session.log.splice(0, session.log.length - 600);
}
function sessStage(id, status) { if (session.stages[id] !== undefined) session.stages[id] = status; }
function sessProgress() {
  const total = SESSION_STAGES.length;
  const done = SESSION_STAGES.filter((s) => session.stages[s] === "done" || session.stages[s] === "skipped").length;
  return { total, done, pct: Math.round((done / total) * 100) };
}

/** 服务端确定性执行（后台跑，写会话；页面轮询 /api/session 展示） */
async function runPipeline(args) {
  const tk = ++session.runToken;
  sessReset(`实时执行 ${new Date().toLocaleTimeString()}`);
  const op = args.op || "";
  const serveOn = args.serve !== false;
  const logOut = (out) => (out || "").split("\n").filter(Boolean).forEach((l) => sessLog("", "", l));
  const step = async (id, name, fn) => {
    if (tk !== session.runToken) return;
    sessStage(id, "running");
    sessLog(id, "st", `${name}　开始`);
    const r = await fn();
    if (tk !== session.runToken) return;
    if (r && r.ok) { sessStage(id, "done"); sessLog(id, "ok", `✓ ${name} 完成`); }
    else { sessStage(id, "skipped"); sessLog(id, "err", `— ${name} 跳过：${(r && r.error) || "失败"}`); }
  };
  await step("n1", "① 输入素材", async () => { const r = await stageInputs(); logOut(r.output); return r; });
  await step("n2", "② bridge-analyze", async () => { const r = await stageAnalyze(); logOut(r.output); return r; });
  await step("n3", "③ 校验 + function schema 导出", async () => {
    const validated = await stageValidate(); logOut(validated.output);
    if (!validated.ok) return validated;
    const projected = await stageSchema(); logOut(projected.output);
    return projected;
  });
  await step("n4b", "④乙 registry 生成", async () => { const r = await stageRegistry(); logOut(r.output); return r; });
  await step("n4a", "④甲 serve 投影", async () => {
    if (!serveOn) { sessLog("n4a", "warn", "　· 跳过：未勾选「启动并保持 serve」"); return { ok: false, error: "未勾选 serve" }; }
    const r = await stageServeStart({ device: "viz-no-car" });
    logOut(r.output);
    return r;
  });
  await step("n5", "⑤ 车端 · 部署+自检", async () => {
    const d = await stageDeploy();
    if (!d.ok) { logOut(d.output || d.error); return d; }
    const c = await stageCarcheck();
    logOut(c.output || c.error);
    return c;
  });
  await step("n6", "⑥ 真实车机 · invoke", async () => {
    if (!state.carIp) { sessLog("n6", "warn", "　· 跳过：车离线（未通过车端自检）"); return { ok: false, error: "车离线" }; }
    const r = await stageInvoke({ op });
    logOut(r.output || r.error);
    return r;
  });
  if (tk === session.runToken) sessLog("", "fin", "■ 执行结束");
}

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

async function fetchJson(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return await r.json();
  } finally { clearTimeout(t); }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (url.pathname === "/api/e2e") {
      // 聚合 gateway(:3000) 端到端状态: 健康度 + 最近会话事件摘要(工具调用/最终回复)
      const out = { gateway: null, sessions: [] };
      try {
        const h = await fetchJson("http://localhost:3000/api/health", 2500);
        out.gateway = { ok: true, ...h };
      } catch {
        out.gateway = { ok: false };
      }
      try {
        const sess = state.session;
        if (sess && sess.id) {
          const ev = await fetchJson(`http://localhost:3000/api/events/${sess.id}`, 2500).catch(() => null);
          if (ev) out.sessions.push({ id: sess.id, note: "cockpit 会话(事件流摘要)" });
        }
      } catch { /* optional */ }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
      return;
    }
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
    if (url.pathname === "/api/target") {
      if (req.method === "POST") {
        let body = await readBody(req);
        const t = JSON.parse(body || "{}");
        if (t.analysis) {
          TARGET.analysis = resolve(PROJECT_ROOT, String(t.analysis));
          TARGET.functionSchema = functionSchemaForAnalysis(TARGET.analysis);
          TARGET.registry = registryForAnalysis(TARGET.analysis);
        }
        if (t.src) TARGET.srcDir = resolve(PROJECT_ROOT, String(t.src));
        if (t.adapter) TARGET.adapter = resolve(PROJECT_ROOT, String(t.adapter));
      }
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        analysis: TARGET.analysis.replace(/\\/g, "/"),
        functionSchema: TARGET.functionSchema.replace(/\\/g, "/"),
        registry: TARGET.registry.replace(/\\/g, "/"),
        srcDir: TARGET.srcDir.replace(/\\/g, "/"),
        adapter: TARGET.adapter.replace(/\\/g, "/"),
        data: targetViewData(),
      }));
    }
    if (url.pathname === "/api/session" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({
        name: session.name, startedAt: session.startedAt,
        stages: session.stages, log: session.log, progress: sessProgress(),
        running: session.log.length > 0 && session.stages.n6 !== "done" && session.stages.n6 !== "skipped",
      }));
    }
    if (url.pathname === "/api/session/start" && req.method === "POST") {
      let body = await readBody(req);
      const { name } = JSON.parse(body || "{}");
      sessReset(name || `skill 会话 ${new Date().toLocaleTimeString()}`);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true, name: session.name }));
    }
    if (url.pathname === "/api/session/event" && req.method === "POST") {
      let body = await readBody(req);
      const { stage, status, cls, msg } = JSON.parse(body || "{}");
      if (status) sessStage(stage, status);
      if (msg) sessLog(stage, cls || "", msg);
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true, progress: sessProgress() }));
    }
    if (url.pathname === "/api/run" && req.method === "POST") {
      let body = await readBody(req);
      const args = JSON.parse(body || "{}");
      runPipeline(args); // 后台执行，页面轮询会话
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === "/api/abort" && req.method === "POST") {
      session.runToken++;
      sessLog("", "warn", "■ 已中止");
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === "/api/stage" && req.method === "POST") {
      let body = await readBody(req);
      const { stage, args } = JSON.parse(body || "{}");
      const fn = STAGES[stage];
      if (!fn) { res.writeHead(400, { "content-type": "application/json" }); return res.end(JSON.stringify({ ok: false, error: `未知阶段 ${stage}` })); }
      const r = await fn(args || {});
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(JSON.stringify({ ok: r.ok, stage, output: r.output || "", error: r.error || "", durationMs: r.durationMs || 0 }));
    }
    const path = (url.pathname === "/" || url.pathname === "/cockpit") ? "pipeline.html" : decodeURIComponent(url.pathname.slice(1));
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
