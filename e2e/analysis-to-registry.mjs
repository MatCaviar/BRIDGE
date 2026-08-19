#!/usr/bin/env node
/**
 * analysis → car registry 生成器 (bridge-analyze 规格的唯一真相源落地)。
 *
 * bridge-analyze 的 analysis.json 同时携带 serve 字段 + 车端机制字段;
 * 本脚本把机制字段投影为执行器 registry.json, 消除双份手写维护。
 *
 * 用法: node analysis-to-registry.mjs <analysis.json> <registry.json>
 */
import { readFileSync, writeFileSync } from "fs";

const [, , analysisPath, outPath] = process.argv;
if (!analysisPath || !outPath) {
  console.error("usage: node analysis-to-registry.mjs <analysis.json> <registry.json>");
  process.exit(1);
}

const analysis = JSON.parse(readFileSync(analysisPath, "utf-8"));
const tools = [];
const builtinMedia = new Set(["media_next", "media_prev", "media_play", "media_pause"]);

for (const cap of analysis.capabilities ?? []) {
  if (builtinMedia.has(cap.id)) continue; // media_* 内置, 不进 registry
  if (cap.status === "broken") continue;  // serve 也跳过
  const t = {
    id: cap.id,
    status: cap.status ?? "probe",
    sourceRef: cap.sourceRef ?? "",
  };
  const m = cap.mechanism ?? "execmd";
  switch (m) {
    case "aidl":
      Object.assign(t, {
        mechanism: "aidl",
        methodName: cap.methodName ?? cap.id,
        pattern: cap.pattern ?? "scalar",
        devicePaths: cap.devicePaths ?? [],
        dataClass: cap.dataClass,
        form: cap.form ?? "binder",
      });
      break;
    case "execmd":
      Object.assign(t, {
        mechanism: "execmd",
        methodName: cap.methodName ?? cap.id,
        pattern: cap.pattern ?? "scalar",
        devicePaths: cap.devicePaths ?? [],
        dataClass: cap.dataClass,
        form: cap.form ?? "binder",
      });
      break;
    case "carcontrol":
      Object.assign(t, {
        mechanism: "carcontrol",
        ccDomain: cap.ccDomain ?? "002",
        ccFunction: cap.ccFunction ?? cap.id,
      });
      break;
    case "mapnav":
      t.mechanism = "mapnav";
      break;
    case "intent":
      t.mechanism = "intent";
      Object.assign(t, { component: cap.component, intentScreens: cap.intentScreens, extras: cap.extras });
      break;
    default:
      t.mechanism = m;
  }
  // bind 目标 (有值才写; 缺省执行器回退顶层默认)
  if (cap.interfaceClass) t.interfaceClass = cap.interfaceClass;
  if (cap.servicePackage) t.servicePackage = cap.servicePackage;
  if (cap.serviceClass) t.serviceClass = cap.serviceClass;
  if (cap.bindAction) t.bindAction = cap.bindAction;
  if (cap.safetyLevel) t.safetyLevel = cap.safetyLevel;
  tools.push(t);
}

const registry = { tools };
writeFileSync(outPath, JSON.stringify(registry, null, 1));
console.log(`registry written: ${tools.length} tools -> ${outPath}`);
