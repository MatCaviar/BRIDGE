#!/usr/bin/env node
/**
 * 错误码驱动契约校准（决策层）——自修复闭环的探测-归因半环。
 *
 * 用法：node calibrate.mjs --analysis <analysis.json> [--url http://127.0.0.1:8766/call] [--out <dir>]
 *
 * 流程：
 *   1) 读 analysis，选出探测对象：presumed 参数（取 examples[0] 作探测值）+ broken 能力（整action探测）；
 *   2) 逐项经桥 call 真机通道，按通道错误码归因：
 *        1402 unknown action → 动作名不符（需修正 action 命名，输出候选建议）
 *        1403 missing param  → 参数名不符（presumed 参数名需修正）
 *        1401 非法值          → 值域不符（enum 需修正）
 *        1400 越界            → 边界不符（min/max 需修正）
 *        1406 service unavailable / HTTP 504 → 目标不可达（服务未部署或 bind 失败，标记待端侧）
 *        0 成功               → presumed 可转正（verified 证据）
 *   3) 产出 calibration-report.json（逐项归因+修正建议）与 analysis.calibrated.json（自动应用无歧义修正：
 *        成功项 presumed→false + status probe→verified；其余仅出建议不擅改）。
 *
 * 原则：无歧义修正才自动应用；命名/值域建议需人确认（错误码只归因类别，不给新值）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const argv = process.argv.slice(2);
const arg = (n, f) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : f; };
if (!argv.includes("--analysis")) { console.error("usage: calibrate.mjs --analysis <analysis.json> [--url http://127.0.0.1:8766/call] [--out <dir>]"); process.exit(1); }
const analysisPath = resolve(arg("--analysis", ""));
const url = arg("--url", "http://127.0.0.1:8766/call");
// 报告默认落 analysis 同目录的 calibration/（项目产物，不写插件目录）
const outDir = resolve(arg("--out", resolve(dirname(analysisPath), "calibration")));

const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
const toolName = analysis.toolContract?.name;
const actionField = analysis.toolContract?.actionField ?? "action";
const contextField = analysis.toolContract?.contextField ?? "extras";
const extras = Object.fromEntries((analysis.toolContract?.context ?? []).map((c) => [
  c.name, c.examples?.[0] ?? (c.type === "integer" ? 0 : c.type === "boolean" ? true : (c.enum?.[0] ?? "probe")),
]));

const ATTR = {
  1402: { cause: "action-name", advice: "动作名与应用注册表不符：核对应用侧 ChannelAction.ACTION_NAME（或以 discover-device.mjs 的清单为线索猜测候选）" },
  1403: { cause: "param-name", advice: "参数名不符：核对应用侧 Action 的请求字段键（KEY_*）" },
  1401: { cause: "value-domain", advice: "取值非法：核对枚举/格式（app 侧 parseParams 的合法值集合）" },
  1400: { cause: "out-of-range", advice: "数值越界：核对 min/max（app 侧校验范围）" },
  1405: { cause: "business-fail", advice: "链路通、业务拒绝：看 data/message 上下文定位业务前置条件" },
  1406: { cause: "service-unavailable", advice: "应用侧服务不可用：端侧未部署/未初始化，属待端侧项（非契约问题）" },
  1407: { cause: "timeout", advice: "业务超时：偶发可重试一次确认" },
  1408: { cause: "internal", advice: "应用内部异常：结合 logcat（CallTrace 前缀）定位" },
};

async function probe(action, paramName, value) {
  const args = { [actionField]: action };
  if (paramName) args[paramName] = value;
  args[contextField] = { ...extras, callId: "cal-" + Math.random().toString(36).slice(2, 8), queryId: "cal" };
  try {
    const r = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: toolName, arguments: args }), signal: AbortSignal.timeout(8000),
    });
    const body = await r.json().catch(() => ({}));
    return { http: r.status, code: body.code, message: body.message };
  } catch (e) {
    return { http: 0, code: "UNREACHABLE", message: e.message.slice(0, 80) };
  }
}

const results = [];
const calibrated = structuredClone(analysis);
const caps = calibrated.capabilities ?? [];

console.log(`探测目标 ${url} ｜ 工具 ${toolName}`);
for (const cap of caps) {
  const probes = [];
  // broken 能力：整 action 探测一次
  if (cap.status === "broken") probes.push({ label: `action:${cap.id}`, param: null, value: null });
  // presumed 参数：用 examples[0]/枚举首值探测
  for (const p of cap.params ?? []) {
    if (p.presumed) probes.push({ label: `param:${cap.id}.${p.name}`, param: p.name, value: p.examples?.[0] ?? p.enum?.[0] ?? p.minimum ?? "1" });
  }
  for (const q of probes) {
    const r = await probe(cap.publicAction ?? cap.id, q.param, q.value);
    const attr = Number.isFinite(Number(r.code)) ? ATTR[Number(r.code)] : null;
    const verdict = r.code === 0 ? "PASS:可转正" : attr?.cause === "service-unavailable" || r.http === 0 || r.http === 504 ? "BLOCKED:待端侧"
      : attr ? `FAIL:${attr.cause}` : `FAIL:http-${r.http}`;
    // 无歧义修正：成功 → presumed 转正（probe→verified 需真机证据，此处只清 presumed 并记 evidence）
    if (r.code === 0) {
      if (q.param) { const p = (cap.params ?? []).find((x) => x.name === q.param); if (p) delete p.presumed; }
      else if (cap.status === "broken") { cap.status = "probe"; delete cap.presumed; cap.deliverNote = "真机探测通过（calibrate.mjs），转 probe 待回归"; }
    }
    results.push({ probe: q.label, action: cap.publicAction ?? cap.id, param: q.param, value: q.value, response: r, verdict, advice: attr?.advice ?? "" });
    console.log(`  ${verdict.padEnd(18)} ${q.label} → code=${r.code} ${String(r.message).slice(0, 30)}`);
  }
}

mkdirSync(outDir, { recursive: true });
const reportPath = resolve(outDir, "calibration-report.json");
writeFileSync(reportPath, JSON.stringify({ target: url, tool: toolName, at: new Date().toISOString(), results }, null, 1), "utf8");
const outAnalysis = resolve(outDir, "analysis.calibrated.json");
writeFileSync(outAnalysis, JSON.stringify(calibrated, null, 1), "utf8");

const nPass = results.filter((r) => r.verdict.startsWith("PASS")).length;
const nFail = results.filter((r) => r.verdict.startsWith("FAIL")).length;
const nBlocked = results.filter((r) => r.verdict.startsWith("BLOCKED")).length;
console.log(`\n校准完成: 可转正 ${nPass} / 需修正 ${nFail} / 待端侧 ${nBlocked}`);
console.log(`  报告: ${reportPath}\n  修正版契约(仅无歧义项已应用): ${outAnalysis}`);
if (nFail) console.log("  命名/值域类建议需人确认后改 analysis.json，再重导出协议表（自修复闭环的修正-复测半环）");
