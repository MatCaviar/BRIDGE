#!/usr/bin/env node
/**
 * 管线可视化数据生成器 (零依赖): 读真实产物 -> viz/data.js
 *
 * 数据源:
 *   e2e/bridge-analysis.json                 唯一真相源 (serve 字段 + 机制字段)
 *   bridge-executor/registries/registry.json 车端 registry (analysis-to-registry.mjs 产物)
 *   tmp/car-backup/probe-full-results.json   车控候选 probe 结果 (可选, 存在才读)
 *
 * 用法:
 *   node viz/gen.mjs                              套件模式(读 e2e/bridge-analysis.json 等)
 *   node viz/gen.mjs <analysis.json> [registry]   任意项目模式(viz/ 目录可整体复制到项目旁, 输出同目录 data.js)
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { basename, dirname, join, sep } from "path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HERE = dirname(fileURLToPath(import.meta.url));

// 任意项目模式: 前两个参数为 analysis / registry 的路径
const argAnalysis = process.argv[2];
const argRegistry = process.argv[3];
const argSchema = process.argv[4];

function schemaForAnalysis(analysisPath) {
  const dir = dirname(analysisPath);
  const stem = basename(analysisPath, ".json");
  if (stem === "analysis") return join(dir, "function-schema.json");
  if (stem.startsWith("analysis-")) return join(dir, `function-schema-${stem.slice("analysis-".length)}.json`);
  if (stem.endsWith("-analysis")) return join(dir, `${stem.slice(0, -"-analysis".length)}-function-schema.json`);
  return join(dir, `function-schema-${stem}.json`);
}

// serve 内置 media 工具 (不进 analysis/registry, 执行器直认) - 与 cli/src/commands/serve.ts 一致
const MEDIA_BUILTINS = [
  { id: "media_next", action: "next", description: "Control media playback: next on the active session (切下一首)" },
  { id: "media_prev", action: "prev", description: "Control media playback: prev on the active session (切上一首)" },
  { id: "media_play", action: "play", description: "Control media playback: play on the active session (播放)" },
  { id: "media_pause", action: "pause", description: "Control media playback: pause on the active session (暂停)" },
];

function readJson(rel) {
  const rp = join(ROOT, rel ?? "");
  if (!existsSync(rp)) return null;
  try {
    return JSON.parse(readFileSync(rp, "utf-8"));
  } catch (e) {
    console.error(`parse error in ${rel}: ${e.message}`);
    process.exit(1);
  }
}

// --- 1. 唯一真相源 ---
const analysisRel = argAnalysis ?? "e2e/bridge-analysis.json";
const analysis = argAnalysis
  ? JSON.parse(readFileSync(argAnalysis, "utf-8"))
  : readJson(analysisRel);
if (!analysis) {
  console.error(`missing analysis: ${analysisRel}`);
  process.exit(1);
}
const caps = analysis.capabilities ?? [];
const byStatus = {};
const byMechanism = {};
for (const c of caps) {
  byStatus[c.status ?? "probe"] = (byStatus[c.status ?? "probe"] ?? 0) + 1;
  const m = c.mechanism ?? "execmd";
  byMechanism[m] = (byMechanism[m] ?? 0) + 1;
}
const active = caps.filter((c) => c.status !== "broken");
// 口径与 skills/bridge-analyze/validate-analysis.mjs 完全一致: serve 工具面 = 非broken + 4 media
const serveTools = active.length + MEDIA_BUILTINS.length;

// --- 2. 上游 Agent function schema（CLI schema 产物） ---
const functionSchemaPath = argSchema ?? schemaForAnalysis(analysisRel);
let functionSchema = null;
if (existsSync(functionSchemaPath)) {
  try { functionSchema = JSON.parse(readFileSync(functionSchemaPath, "utf-8")); }
  catch (e) { console.error(`parse error in ${functionSchemaPath}: ${e.message}`); process.exit(1); }
}
const functionSchemas = functionSchema?.functions?.length ?? serveTools;

// --- 3. 车端 registry + 与 analysis 的一致性 ---
const registryRel = argRegistry ?? "bridge-executor/registries/registry.json";
const registryJson = argRegistry
  ? (existsSync(argRegistry) ? JSON.parse(readFileSync(argRegistry, "utf-8")) : null)
  : readJson(registryRel);
let registry = { present: false, tools: 0 };
if (registryJson) {
  const regTools = registryJson.tools ?? [];
  const regByMech = {};
  for (const t of regTools) {
    regByMech[t.mechanism ?? "execmd"] = (regByMech[t.mechanism ?? "execmd"] ?? 0) + 1;
  }
  const regIds = new Set(regTools.map((t) => t.id));
  const activeIds = new Set(active.map((c) => c.id)); // media_* 不在 caps, registry 也应无
  registry = {
    present: true,
    tools: regTools.length,
    byMechanism: regByMech,
    // 配对全景消费: 每个车端 registry 条目(与 capability/function schema 同 id 配对)
    entries: regTools.map((t) => ({
      id: t.id, mechanism: t.mechanism ?? "execmd", methodName: t.methodName ?? "",
      pattern: t.pattern ?? "", dataClass: t.dataClass ?? null, form: t.form ?? "",
      status: t.status ?? "probe", sourceRef: t.sourceRef ?? "",
    })),
    missingFromRegistry: [...activeIds].filter((id) => !regIds.has(id)),
    extraInRegistry: [...regIds].filter((id) => !activeIds.has(id)),
  };
}

// --- 4. probe 结果 (可选) ---
const probeJson = readJson("tmp/car-backup/probe-full-results.json");
const probe = probeJson
  ? {
      present: true,
      totalCandidates: probeJson.totalCandidates ?? null,
      verifiedThisRun: probeJson.verifiedThisRun ?? null,
      allVerified: probeJson.all57Verified === true,
      date: probeJson.date ?? "",
      note: probeJson.note ?? "",
    }
  : { present: false };

const payload = {
  generatedAt: new Date().toISOString(),
  version: "0.1.25",
  sources: {
    analysis: argAnalysis ? analysisRel.split(sep).join("/") : "e2e/bridge-analysis.json",
    functionSchema: functionSchemaPath.split(sep).join("/"),
    registry: argRegistry ? registryRel.split(sep).join("/") : (registryJson ? "bridge-executor/registries/registry.json" : ""),
    probe: "tmp/car-backup/probe-full-results.json",
  },
  title: {
    input: `${(analysis.app ?? {}).name ?? "应用"} ${(analysis.app ?? {}).framework === "apk-reverse" ? "APK" : "应用源码"}`,
    output: "Agent Functions + MCP 工具套件",
  },
  app: analysis.app ?? {},
  stats: {
    totalCaps: caps.length,
    verified: byStatus.verified ?? 0,
    probe: byStatus.probe ?? 0,
    broken: byStatus.broken ?? 0,
    active: active.length,
    serveTools,
    functionSchemas,
    byMechanism,
    registryTools: registry.present ? registry.tools : 0,
  },
  capabilities: caps,
  mediaBuiltins: MEDIA_BUILTINS,
  registry,
  // 交付物 · 上游 Agent function schema(注入 e2e LLM 的同一份) — 配对全景与交付清单消费
  functionSchemaDeliverable: functionSchema
    ? {
        path: functionSchemaPath.split(sep).join("/"),
        count: functionSchema.functions.length,
        schemaVersion: functionSchema.schemaVersion ?? "",
        functions: functionSchema.functions,
      }
    : null,
  probe,
};

const out = join(HERE, "data.js");
writeFileSync(
  out,
  "// 由 viz/gen.mjs 生成 (勿手改); 刷新: node viz/gen.mjs\n" +
    "window.__PIPELINE_DATA__ = " +
    JSON.stringify(payload, null, 1) +
    ";\n"
);
console.log(
  `viz/data.js written: caps=${caps.length} (verified=${byStatus.verified ?? 0} probe=${byStatus.probe ?? 0} broken=${byStatus.broken ?? 0})` +
    ` functionSchemas=${functionSchemas} serveTools=${serveTools} (active ${active.length} + 4 media)` +
    ` registry=${registry.present ? registry.tools : "-"} probe=${probe.present ? `${probe.totalCandidates} candidates (allVerified=${probe.allVerified})` : "-"}`
);
