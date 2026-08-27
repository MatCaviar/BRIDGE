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
import { createServer, request as httpRequest } from "http";
import { spawn, execFile } from "child_process";
import { readFileSync, writeFileSync, existsSync, statSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, basename, resolve } from "path";

const VIZ = dirname(fileURLToPath(import.meta.url));
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
  srcDir: argValue("--src") ? resolve(PROJECT_ROOT, argValue("--src")) : (analysisArg ? PROJECT_ROOT : join(ROOT, "cli", "tests", "fixtures", "imaudio")),
  adapter: argValue("--adapter") ? resolve(PROJECT_ROOT, argValue("--adapter")) : (analysisArg ? PROJECT_ROOT : join(ROOT, "cli", "tests", "fixtures", "imaudio", "IMAudioServiceAdapter.kt")),
};

const PORT = Number(argValue("--port") || process.env.PORT || 8650);

// POST body 健壮解码: 严格 UTF-8, 失败按 GBK 兜底(Windows GBK 客户端常见), 再失败退 utf-8 宽松
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

const HOST = "127.0.0.1";

const state = { carIp: null, carModel: null, carFailedAt: 0, serveProc: null, serveLog: [], showE2E: false };

/* ---------- 端到端网关: 同源代理(/e2e/*) + 按需自动拉起(通用, 单端口体验) ----------
   页面只在 :8650 内活动; gateway(默认 :3000, BRIDGE_E2E_URL 可配)作为内部实现细节
   由本后端代理并自动启动: 首次使用自动 npm install + tsc + 生成配置; 无 LLM key 时
   降级 mock provider(工具面/注入可用); 项目模式(--analysis)自动指向本次分析产物。 */
const E2E_DIR = join(ROOT, "e2e");
const E2E_BASE = (process.env.BRIDGE_E2E_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const E2E_TARGET = new URL(E2E_BASE);
const gw = { proc: null, phase: "", starting: false, log: [], apiKey: "", needsKey: false,
  // 自动端到端测试实时状态(cockpit 轮询渲染; 不写入管线会话日志, 管线页保持纯净)
  tests: { running: false, total: 0, index: 0, current: "", results: [], updatedAt: 0 } };
function gwLog(line) {
  gw.log.push(line);
  if (gw.log.length > 60) gw.log.splice(0, gw.log.length - 60);
  console.error(`[e2e] ${line}`);
}
async function gwProbe() {
  try { await fetchJson(`${E2E_BASE}/api/health`, 1500); return true; } catch (e) { return false; }
}
/** 由 analysis 产物生成 system_prompt 的工具清单段(泛化: 不绑定任何 app, 描述取自 capability) */
function toolLinesFor(analysis) {
  const caps = (analysis.capabilities ?? []).filter((c) => c.status !== "broken");
  const byDomain = new Map();
  for (const c of caps) {
    const d = c.domain || (analysis.app && analysis.app.name) || "app";
    if (!byDomain.has(d)) byDomain.set(d, []);
    byDomain.get(d).push(c);
  }
  const lines = [];
  for (const [domain, list] of byDomain) {
    lines.push(`    ◆ ${domain}:`);
    for (const c of list) {
      const brief = String(c.description || "").replace(/\s+/g, " ").split(/(?<=[。;；.])\s*/)[0].slice(0, 110);
      const req = (c.params ?? []).filter((p) => !p.optional).map((p) => p.name).join("/");
      lines.push(`      - ${c.id}${req ? `(${req})` : "(无参数)"}: ${brief}`);
    }
  }
  lines.push(`    ◆ 媒体播控(内置): media_next / media_prev / media_play / media_pause`);
  return lines.join("\n");
}
/** 由 capability 可选字段 uiSync={argKey,map} 生成 ui_sync 段(无数据返回空串) */
function uiSyncYamlFor(analysis) {
  const entries = (analysis.capabilities ?? []).filter((c) => c.uiSync && c.uiSync.map && Object.keys(c.uiSync.map).length);
  if (!entries.length) return "";
  const blocks = entries.map((c) =>
    `  - tool: ${c.id}\n    arg_key: ${c.uiSync.argKey || ""}\n    map:\n` +
    Object.entries(c.uiSync.map).map(([k, v]) => `      "${k}": ${JSON.stringify(String(v))}`).join("\n"));
  return `ui_sync:\n${blocks.join("\n")}`;
}
function gatewayConfigPath() {
  if (process.env.BRIDGE_E2E_CONFIG) return resolve(PROJECT_ROOT, process.env.BRIDGE_E2E_CONFIG);
  const template = read(join(E2E_DIR, "config-cockpit.yaml"));
  if (!template) return join(E2E_DIR, "config-cockpit.yaml");
  let text = template;
  // 配置写到 viz/ 目录 — 配置加载器把相对路径按配置所在目录解析, 模板内全部相对路径须换成绝对路径
  // (漏掉任何一个都会让对应 stdio 子进程 spawn 到不存在的脚本而瞬崩 → "Connection closed")
  text = text
    .replace(/"bridge-serve-wrapper\.mjs"/g, JSON.stringify(join(E2E_DIR, "bridge-serve-wrapper.mjs").replace(/\\/g, "/")))
    .replace(/"bridge-ui-server\.mjs"/g, JSON.stringify(join(E2E_DIR, "bridge-ui-server.mjs").replace(/\\/g, "/")))
    .replace(/"\.\.\/cli\/bin\/mcp-pipeline\.js"/g, JSON.stringify(CLI.replace(/\\/g, "/")));
  // 项目模式: serve 指向本次分析产物
  if (resolvedAnalysis && existsSync(resolvedAnalysis)) {
    text = text.replace(/"--analysis",\s*"bridge-analysis\.json"/,
      `"--analysis", ${JSON.stringify(resolvedAnalysis.replace(/\\/g, "/"))}`);
  }
  // system_prompt 工具清单与 ui_sync 按本次 analysis 动态生成(泛化, 不绑定任何 app)
  let analysis = null;
  try { analysis = JSON.parse(read(resolvedAnalysis)); } catch (e) { /* 占位行保留 */ }
  if (analysis) {
    text = text.replace(/^ {4}\(本行由 viz\/run\.mjs 按本次分析产物自动替换为工具清单\)$/m, toolLinesFor(analysis));
    const uiSync = uiSyncYamlFor(analysis);
    if (uiSync) text = text.replace(/\ntask:/, "\n" + uiSync + "\ntask:");
  }
  // LLM key 是刚需: 取不到就询问用户(页面输入, POST /api/e2e/key), 不做 mock 降级
  if (!gw.apiKey && !process.env.QWEN_API_KEY) {
    gw.needsKey = true;
    return null;
  }
  gw.needsKey = false;
  const out = join(VIZ, ".e2e-config.yaml");
  writeFileSync(out, text);
  return out;
}
async function bootstrapGateway() {
  try {
    if (!existsSync(join(E2E_DIR, "node_modules"))) {
      gw.phase = "install";
      gwLog("首次运行: 安装 e2e 依赖 (npm install, 约 1 分钟)…");
      const r = await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: E2E_DIR, timeout: 420000, shell: true });
      if (!r.ok) { gwLog("npm install 失败: " + r.output.slice(-300)); return; }
    }
    const distServer = join(E2E_DIR, "dist", "web", "server.js");
    if (!existsSync(distServer)) {
      gw.phase = "build";
      gwLog("构建 e2e (tsc)…");
      const tsc = join(E2E_DIR, "node_modules", "typescript", "bin", "tsc");
      const b = existsSync(tsc)
        ? await run(process.execPath, [tsc], { cwd: E2E_DIR, timeout: 240000 })
        : await run("npx", ["tsc"], { cwd: E2E_DIR, timeout: 240000, shell: true });
      if (!b.ok || !existsSync(distServer)) { gwLog("构建失败: " + b.output.slice(-300)); return; }
    }
    gw.phase = "start";
    const cfg = gatewayConfigPath();
    if (!cfg) {
      gwLog("缺少 LLM API key (QWEN_API_KEY) — 请在页面输入(仅存内存)或设置环境变量后重试");
      return;
    }
    gwLog(`启动网关: node dist/web/server.js --config ${cfg}`);
    const gwPort = Number(E2E_TARGET.port) || 3000; // 端口跟随 BRIDGE_E2E_URL, 与代理/探活一致
    const p = spawn(process.execPath, [join(E2E_DIR, "dist", "web", "server.js"), "--config", cfg, "--port", String(gwPort)],
      { cwd: E2E_DIR, windowsHide: true, env: { ...process.env, ...(gw.apiKey ? { QWEN_API_KEY: gw.apiKey } : {}) } });
    gw.proc = p;
    const onOut = (d) => d.toString().split(/\r?\n/).filter(Boolean).slice(-2).forEach((l) => gwLog(l));
    p.stdout.on("data", onOut);
    p.stderr.on("data", onOut);
    p.on("exit", (code) => { gwLog(`网关进程退出 (code=${code})`); if (gw.proc === p) gw.proc = null; });
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      if (await gwProbe()) { gwLog("网关就绪"); return; }
      if (p.exitCode !== null && p.exitCode !== undefined && !gw.proc) break;
    }
    gwLog("网关未在 20s 内就绪 — 检查上方日志");
  } catch (e) {
    gwLog("启动异常: " + String(e.message));
  } finally {
    gw.starting = false;
    gw.phase = "";
  }
}
async function ensureGateway() {
  if (await gwProbe()) return { ok: true };
  if (gw.starting) {
    // 看门狗: bootstrap 卡死(如宿主被 killing 致子进程握管道挂死)3 分钟无进展则复位重试
    if (Date.now() - (gw.startedAt || 0) > 180000) {
      gwLog("bootstrap 疑似卡死超过 3 分钟 — 复位重试");
      gw.starting = false;
      gw.phase = "";
    } else {
      return { ok: false, starting: true, phase: gw.phase };
    }
  }
  gw.starting = true;
  gw.startedAt = Date.now();
  bootstrapGateway(); // 后台执行, 阶段经 /api/e2e 与 /e2e 503 响应可见
  return { ok: false, starting: true, phase: gw.phase };
}
/** 单条端到端测试: 真实 LLM 回合。判定: expect="none" → 期望不调用任何工具(防幻觉);
 *  expect 为空 → 只记录; 否则 = 期望工具是否被选中 */
async function runOneE2eTest(message, expect) {
  const out = { message, expect: expect || "", called: [], final: "", pass: !expect };
  try {
    const r = await fetch(`${E2E_BASE}/api/run`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const { sessionId } = await r.json();
    if (!sessionId) throw new Error(String((await r.json().catch(() => ({}))).error || "no sessionId"));
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 90000);
    const s = await fetch(`${E2E_BASE}/api/events/${sessionId}`, { signal: ac.signal });
    const reader = s.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!dataLine) continue;
        let ev;
        try { ev = JSON.parse(dataLine.slice(6)); } catch { continue; }
        if (ev.type === "tool_call_started" && ev.toolName) out.called.push(ev.toolName);
        if (ev.type === "session_completed") out.final = String(ev.finalText || "");
        if (ev.type === "session_error") out.final = "会话错误: " + String(ev.error || "");
        if (ev.type === "session_completed" || ev.type === "session_error") {
          clearTimeout(timer);
          try { ac.abort(); } catch { /* already closed */ }
          out.pass = expect === "none" ? out.called.length === 0
            : !expect || out.called.includes(expect);
          return out;
        }
      }
    }
    clearTimeout(timer);
  } catch (e) {
    out.final = "测试执行异常: " + String(e.message || e);
  }
  out.pass = expect === "none" ? out.called.length === 0 && !/异常|会话错误/.test(out.final)
    : !expect || (expect && out.called.includes(expect));
  return out;
}
/** host codeagent 驱动的自动端到端测试: 顺序执行, 实时状态供 cockpit 展示(自动跟随逐轮),
 * 判定 = LLM 是否选中期望工具(以发现问题为导向); 不写管线会话日志。 */
async function runE2eTests(tests) {
  gw.tests = { running: true, total: tests.length, index: 0, current: "", results: [], updatedAt: Date.now() };
  state.showE2E = true; // 测试开始即把用户页面自动切到 cockpit, 逐轮实时观看
  const finish = (result) => {
    gw.tests.running = false;
    gw.tests.updatedAt = Date.now();
    return result;
  };
  if (!(await gwProbe())) {
    ensureGateway();
    for (let i = 0; i < 90 && !(await gwProbe()); i++) await sleep(1000);
  }
  if (!(await gwProbe())) {
    const why = gw.needsKey ? "缺少 LLM API key — 页面会向用户询问, 补 key 后重试" : "网关未能启动(见后端日志)";
    return finish({ ok: false, needsKey: gw.needsKey, error: why });
  }
  const results = [];
  for (const [i, t] of tests.entries()) {
    const expect = t.expectTool || "";
    gw.tests.index = i + 1;
    gw.tests.current = t.message;
    gw.tests.updatedAt = Date.now();
    const r = await runOneE2eTest(t.message, expect);
    results.push(r);
    gw.tests.results = results;
    gw.tests.updatedAt = Date.now();
  }
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  return finish({
    ok: true, pass: passed, total: results.length, results,
    note: failed.length ? `未通过 ${failed.length} 条(期望工具未被选中 → 优化对应 description 后 POST /api/e2e/restart 重测)` : "全部通过",
  });
}
/** 同源代理: /e2e/* → gateway(*)。HTML 响应注入 fetch/EventSource 前缀补丁, 让页面内
 *  的 /api/* 调用与 SSE 落回 /e2e/api/*; 其余(含 SSE 流)原样透传。 */
function proxyToGateway(req, res, path) {
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["accept-encoding"];
  const preq = httpRequest(
    { hostname: E2E_TARGET.hostname, port: E2E_TARGET.port, path, method: req.method, headers },
    (pres) => {
      const isHtml = /text\/html/.test(String(pres.headers["content-type"] || ""));
      if (!isHtml) {
        res.writeHead(pres.statusCode || 502, pres.headers);
        pres.pipe(res);
        return;
      }
      const chunks = [];
      pres.on("data", (c) => chunks.push(c));
      pres.on("end", () => {
        let body = Buffer.concat(chunks).toString("utf8");
        const h = { ...pres.headers };
        delete h["content-length"];
        const patch = `<script>/* BRIDGE same-origin proxy patch */(function(){var P="/e2e";var f=window.fetch;window.fetch=function(i,init){try{var u=typeof i==="string"?i:(i&&i.url);if(u&&u.charAt(0)==="/"&&u.indexOf(P+"/")!==0){u=P+u;return typeof i==="string"?f(u,init):f(new Request(u,i),init);}}catch(e){}return f(i,init);};if(window.EventSource){var E=window.EventSource;window.EventSource=function(u,c){if(typeof u==="string"&&u.charAt(0)==="/"&&u.indexOf(P+"/")!==0)u=P+u;return new E(u,c);};}})();</script>`;
        body = body.replace(/<head([^>]*)>/i, (m) => m + patch);
        res.writeHead(pres.statusCode || 502, h);
        res.end(body);
      });
    });
  preq.on("error", (e) => {
    try {
      res.writeHead(502, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: false, error: String(e.message) }));
    } catch (_) { /* client gone */ }
  });
  req.pipe(preq);
}

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
    let settled = false;
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (out += d.toString()));
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); clearTimeout(hardCap); resolve(r); } };
    const timer = setTimeout(() => { try { p.kill(); } catch (e) {} }, opts.timeout || 60000);
    // 硬兜底: shell:true 的子进程被外力杀死时, 孙进程可能握着管道使 close 永不触发 — 到点强制结算
    const hardCap = setTimeout(() => done({ ok: false, code: -1, output: "timeout(hard): " + out.trim().slice(-200), durationMs: Date.now() - t0 }), (opts.timeout || 60000) + 8000);
    p.on("close", (code) => {
      done({ ok: code === 0, code, output: out.trim(), durationMs: Date.now() - t0 });
    });
    p.on("error", (e) => {
      done({ ok: false, code: -1, output: String(e.message), durationMs: Date.now() - t0 });
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
      entries: registryTools.map((t) => ({
        id: t.id, mechanism: t.mechanism ?? "execmd", methodName: t.methodName ?? "",
        pattern: t.pattern ?? "", dataClass: t.dataClass ?? null, form: t.form ?? "",
        status: t.status ?? "probe", sourceRef: t.sourceRef ?? "",
      })),
      missingFromRegistry: [...activeIds].filter((id) => !registryIds.has(id)),
      extraInRegistry: [...registryIds].filter((id) => !activeIds.has(id)),
    },
    functionSchemaDeliverable: functionSchemas.length
      ? { path: TARGET.functionSchema.replace(/\\/g, "/"), count: functionSchemas.length, functions: functionSchemas }
      : null,
    mediaBuiltins: MEDIA_BUILTINS,
    probe: { present: false },
  };
}

/** inputs: 盘点 bridge-analyze 的真实输入素材（源码/逆向产物/分析产物） */
async function stageInputs() {
  const suiteSampleMode = !argValue("--analysis");
  const items = [
    ["被分析源码（适配器）", TARGET.adapter],
    ["唯一真相源（分析产物）", TARGET.analysis],
    ["执行器契约面", TARGET.srcDir],
    ...(suiteSampleMode ? [
      ["车控 handler 映射（逆向产物）", join(ROOT, "tools", "carcontrol_handlers.json")],
      ["车控候选工具（逆向产物）", join(ROOT, "tools", "carcontrol_tools_candidate.json")],
      ["逆向素材说明（dex dump 位置）", join(ROOT, "reverse", "README.md")],
    ] : []),
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
    ...(suiteSampleMode ? [`  完整逆向 dex dump（仓库样例项目相关，不入库）；来源与交接位置见 reverse/README.md`] : []),
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
  // 通用 sourceRef 可定位性核对 — 项目/套件演示同一实现, 不绑定任何样例契约;
  // 逐字 wire 契约核对由 bridge-analyze 验证协议第 5 步在宿主侧执行。
  const activeCaps = caps.filter((c) => c.status !== "broken");
  const miss = activeCaps.filter((c) => {
    const ref = String(c.sourceRef || "").split(":")[0];
    return !(ref && existsSync(join(SRC, ref)));
  });
  const out = [
    `【载入真相源】${TARGET.analysis.replace(/\\/g, "/")}`,
    `  capabilities: ${caps.length}（verified ${byStatus.verified || 0} · broken ${byStatus.broken || 0}）`,
    `  机制分布: ${Object.entries(byMech).map(([m, n]) => `${m} ${n}`).join(" · ")} · serve 工具面 ${active + 4}`,
    ``,
    `【sourceRef 可定位性核对（通用）】${SRC.replace(/\\/g, "/")}`,
    `  非 broken ${activeCaps.length}: sourceRef 文件可定位 ${activeCaps.length - miss.length}/${activeCaps.length}${miss.length ? `（待核: ${miss.map((c) => c.id).join("、")}）` : " ✓"}`,
    `  逐字 wire 核对(methodName/枚举/注入路径)由 host codeagent 按验证协议第 5 步完成`,
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

const handler = async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  try {
    if (url.pathname === "/api/e2e") {
      // 端到端网关状态(同源代理视图): ok 时前端直接 iframe /e2e/cockpit; down 时触发自动拉起并回报阶段
      const out = { gateway: null, sessions: [] };
      if (await gwProbe()) {
        let h = {};
        try { h = await fetchJson(`${E2E_BASE}/api/health`, 2500); } catch (e) { /* probe已过, 忽略 */ }
        out.gateway = { ok: true, url: "/e2e/cockpit", proxied: true, ...h };
      } else {
        const st = await ensureGateway();
        out.gateway = { ok: false, url: "/e2e/cockpit", proxied: true, starting: st.starting === true, phase: st.phase || "", needsKey: gw.needsKey, log: gw.log.slice(-5) };
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
        // host codeagent 收尾端到端演示时置位(POST /api/e2e/show), 已打开的页面轮询到后自动切换到端到端视图
        showE2E: state.showE2E === true,
      }));
    }
    if (url.pathname === "/api/e2e/restart" && req.method === "POST") {
      // host codeagent 优化 description 后重启网关, 使新生成的配置(含 system_prompt 工具清单)生效
      if (gw.proc) { try { gw.proc.kill(); } catch (e) { /* already dead */ } gw.proc = null; }
      gwLog("按请求重启网关(应用更新后的 analysis)");
      ensureGateway();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === "/api/e2e/test" && req.method === "POST") {
      // 自动端到端测试(同步响应, 通常 1-2 分钟): 逐条实时写入 /api/session(n6), cockpit 自动跟随展示
      let body = await readBody(req);
      let tests = [];
      try { tests = (JSON.parse(body || "{}").tests || []).filter((t) => t && t.message); } catch (e) { tests = []; }
      if (!tests.length) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ ok: false, error: "tests 为空(需 [{message, expectTool}])" }));
      }
      const result = await runE2eTests(tests);
      res.writeHead(result.ok ? 200 : 503, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify(result));
    }
    if (url.pathname === "/api/e2e/show" && req.method === "POST") {
      state.showE2E = true;
      ensureGateway();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: true }));
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
    if (url.pathname === "/api/e2e/key" && req.method === "POST") {
      // 用户经页面提交 LLM key — 仅存本机后端内存(不落盘/不入仓), 提交后自动拉起网关
      let body = await readBody(req);
      let key = "";
      try { key = String((JSON.parse(body || "{}").key || "")).trim(); } catch (e) { key = ""; }
      if (!key) {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({ ok: false, error: "key 不能为空" }));
      }
      gw.apiKey = key;
      gw.needsKey = false;
      gwLog("已收到 LLM API key(仅内存) — 拉起网关");
      ensureGateway();
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ ok: true }));
    }
    if (url.pathname === "/e2e" || url.pathname.startsWith("/e2e/")) {
      // 同源端到端入口: /e2e 与 /e2e/ → cockpit; /e2e/api/* → gateway API(含 SSE 透传)
      ensureGateway();
      let sub = url.pathname.replace(/^\/e2e/, "");
      if (!sub || sub === "/") sub = "/cockpit";
      // 测试实时状态由本后端直接供给(cockpit 进度条轮询), 不转发网关
      if (sub === "/api/tests") {
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        return res.end(JSON.stringify(gw.tests));
      }
      if (!(await gwProbe())) {
        res.writeHead(503, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ ok: false, starting: gw.starting, phase: gw.phase, log: gw.log.slice(-6) }));
        return;
      }
      proxyToGateway(req, res, sub);
      return;
    }
    const path = (url.pathname === "/" || url.pathname === "/cockpit") ? "pipeline.html" : decodeURIComponent(url.pathname.slice(1));
    return serveFile(res, path);
  } catch (e) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: String(e.message) }));
  }
};

createServer(handler).listen(PORT, "127.0.0.1", () => {
  console.log(`BRIDGE 管线可视化 · 实时后端就绪`);
  console.log(`  页面: http://127.0.0.1:${PORT}/pipeline.html 与 http://localhost:${PORT}/cockpit （双栈回环）`);
  console.log(`  adb: ${ADB}`);
  console.log(`  退出: Ctrl+C`);
  // --open / BRIDGE_VIZ_OPEN=1: 由后端直接在用户默认浏览器打开页面(host codeagent 不必自行拼命令,
  // 规避 Git Bash 下 cmd start 的路径转义问题); 无图形环境静默忽略, 由调用方以文字告知地址。
  if (argValue("--open") || process.env.BRIDGE_VIZ_OPEN === "1") {
    const url = `http://127.0.0.1:${PORT}/pipeline.html`;
    try {
      if (process.platform === "win32") {
        spawn("powershell.exe", ["-NoProfile", "-Command", `Start-Process '${url}'`], { windowsHide: true, stdio: "ignore" });
      } else if (process.platform === "darwin") {
        spawn("open", [url], { stdio: "ignore" });
      } else {
        spawn("xdg-open", [url], { stdio: "ignore" });
      }
      console.log(`  已请求在默认浏览器打开: ${url}`);
    } catch (e) { console.log(`  打开浏览器失败(无图形环境?): ${url}`); }
  }
});
// Windows 的 localhost 优先解析 ::1 — 补 IPv6 回环监听, 保证 http://localhost:<port> 浏览器可达
try {
  createServer(handler).on("error", () => { /* IPv6 回环不可用时静默忽略 */ }).listen(PORT, "::1");
} catch (e) { /* 同上 */ }
