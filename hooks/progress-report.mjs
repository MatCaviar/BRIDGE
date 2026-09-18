#!/usr/bin/env node
/**
 * 进度自动上报 hook —— 可视化「分析时不动」的根治：任务进展不再依赖 codeagent 自觉
 * 手动 POST /api/session/*，而是在工具调用层确定性推断阶段并上报。
 *
 * 用法（hooks.json）：
 *   PreToolUse  (Bash|Write|Edit) → node progress-report.mjs pre
 *   PostToolUse (Bash|Write|Edit) → node progress-report.mjs post
 *
 * stdin: hook 载荷 JSON（tool_name / tool_input / tool_response）。
 * 规则（inferEvent）把命令或文件映射到管线阶段：
 *   写 analysis.json           → n2 done（分析产出）
 *   validate-analysis.mjs      → n3 校验
 *   mcp-pipeline schema        → n3 schema 导出
 *   analysis-to-registry.mjs   → n4b registry
 *   mcp-pipeline serve         → n4a serve
 *   mcp-pipeline call|invoke   → n6 invoke
 *   viz/gen.mjs|run.mjs        → 日志（可视化产物）
 * 首次 bridge 活动自动建会话并补 n1 done（输入素材受理）。
 *
 * 原则：匹配不到 bridge 活动零网络请求；上报 fire-and-forget（≤1.5s 超时，失败静默），绝不阻断工具调用。
 */
import { createConnection } from "node:net";

const VIZ_URL = process.env.BRIDGE_VIZ_URL || "http://127.0.0.1:8650";
const HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const PHASE = "bridge-progress";

/** 命令/文件 → 阶段事件；null = 与 bridge 无关（零开销放行）。 */
export function inferEvent(phase, toolName, toolInput = {}) {
  const command = String(toolInput.command || "");
  const filePath = String(toolInput.file_path || "");
  const text = `${command}\n${filePath}`;
  if (!text) return null;

  const isAnalysisWrite = (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit") &&
    /(^|[\\/])analysis[^\\/]*\.json$/.test(filePath.trim());
  if (isAnalysisWrite) {
    return phase === "post"
      ? { stage: "n2", status: "done", cls: "ok", msg: "✓ ② bridge-analyze 分析：产出 analysis.json" }
      : { stage: "n2", status: "running", cls: "st", msg: "② bridge-analyze 分析：写入 analysis.json …" };
  }

  if (!command) return null;
  const c = command.toLowerCase();

  const run = (stage, name, cls = "st") => ({
    stage, status: phase === "post" ? "done" : "running",
    cls: phase === "post" ? "ok" : cls,
    msg: phase === "post" ? `✓ ${name} 完成` : `${name} …`,
  });

  if (c.includes("validate-analysis")) return run("n3", "③ 契约校验 validate-analysis");
  if (/mcp-pipeline[^&|;]*\bschema\b/.test(c)) return run("n3", "③ function schema 导出");
  if (c.includes("analysis-to-registry")) return run("n4b", "④乙 registry 生成");
  if (/mcp-pipeline[^&|;]*\bserve\b/.test(c)) return run("n4a", "④甲 MCP serve 投影");
  if (/mcp-pipeline[^&|;]*\b(call|invoke)\b/.test(c)) return run("n6", "⑥ 调用执行 call/invoke");
  if (/viz[\\/]gen\.mjs/.test(c) || /viz[\\/]run\.mjs/.test(c)) {
    return phase === "post"
      ? { cls: "ok", msg: "　· 可视化数据/服务就绪" }
      : { cls: "st", msg: "　· 可视化数据生成 …" };
  }
  // 宽松兜底：bridge 套件根内的一切 bridge 相关命令，至少留下活动痕迹
  if (c.includes("bridge") && (c.includes(".mjs") || c.includes("mcp-pipeline"))) {
    return { cls: "st", msg: `　· ${command.split("\n")[0].slice(0, 80)}` };
  }
  return null;
}

function isListening(host, port) {
  return new Promise((resolvePing) => {
    const socket = createConnection({ host, port });
    const done = (v) => { socket.destroy(); resolvePing(v); };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
  });
}

/** fire-and-forget 上报：探活失败即放弃；总预算 ~1.2s，任何错误静默。 */
async function report(events) {
  let url;
  try { url = new URL(VIZ_URL); } catch { return; }
  if (!HOSTS.has(url.hostname)) return;
  const port = Number(url.port || 8650);
  if (!(await isListening(url.hostname, port))) return;

  const base = `http://${url.hostname}:${port}`;
  const post = async (path, body) => {
    const r = await fetch(base + path, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(600),
    }).catch(() => null);
    return r && r.ok;
  };
  for (const e of events.rest) await post("/api/session/event", { ...e, phase: PHASE });
}

async function main() {
  const phase = process.argv[2] === "post" ? "post" : "pre";
  let payload = "";
  for await (const chunk of process.stdin) payload += chunk;
  let input = {};
  try { input = JSON.parse(payload || "{}"); } catch { input = {}; }
  const event = inferEvent(phase, input.tool_name || input.toolName, input.tool_input || input.toolInput || {});
  if (!event) return;

  // 首次 bridge 活动：补 n1（输入素材受理）；服务器端对未初始化会话自动建会话。
  const first = { stage: "n1", status: "done", cls: "ok", msg: "✓ ① 输入素材受理（PRD/源码）" };
  await report({ rest: [first, event] });
}

// 仅命令行调用（带 pre|post 参数）时执行；作为模块导入只暴露 inferEvent 供测试
if (process.argv[2]) main().catch(() => {});
