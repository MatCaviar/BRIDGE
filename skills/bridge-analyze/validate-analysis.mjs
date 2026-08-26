#!/usr/bin/env node
/**
 * bridge-analyze 规格校验器 — analysis.json 的自查工具。
 *
 * 对齐 E2E serve 消费的规格(旧插件 validate 面向 scaffold, 要求 sdkCalls 且禁止额外属性,
 * 与新规格不兼容)。本校验器检查:
 *   - app 块 / capability 必填字段 / id 唯一性
 *   - params: name 唯一、type 合法、enum 非空、optional 类型
 *   - status 三态、safetyLevel、sourceRef 可溯源
 *   - description 存在且可行动(面向 LLM 选工具)
 *   - 机制字段一致性(execmd→methodName/pattern, carcontrol→ccFunction, devicePaths∈app.deviceSources)
 *
 * 用法: node validate-analysis.mjs <analysis.json>
 * 退出码: 0=通过, 1=有问题
 */
import { readFileSync } from "fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node validate-analysis.mjs <analysis.json>");
  process.exit(1);
}

const analysis = JSON.parse(readFileSync(path, "utf-8"));
const errors = [];
const warns = [];

const VALID_TYPES = new Set(["string", "int", "long", "number", "boolean", "array", "object", "float", "double", "byte", "short"]);
const VALID_STATUS = new Set(["verified", "probe", "broken"]);
const VALID_SAFETY = new Set(["readonly", "normal", "broken", "p_gear_required", "p_gear_and_confirm", "p_gear_and_network"]);
const VALID_MECH = new Set(["aidl", "execmd", "media", "mapnav", "carcontrol", "intent"]);
const EXECUTOR_DEVICE_SOURCES = new Set(["vin"]);
const BUILTIN_MEDIA = new Set(["media_next", "media_prev", "media_play", "media_pause"]);

// app
if (!analysis.app?.name) errors.push("app.name 缺失");
const deviceSources = new Set(analysis.app?.deviceSources ?? []);

// capabilities
const caps = analysis.capabilities ?? [];
if (caps.length === 0) errors.push("capabilities 为空");
const seenIds = new Set();
for (const [i, c] of caps.entries()) {
  const at = `capabilities[${i}] (${c.id ?? "?"})`;
  if (!c.id) { errors.push(`${at}: 缺 id`); continue; }
  if (!/^[a-z][a-z0-9_]*$/.test(c.id)) errors.push(`${at}: id 应为 snake_case`);
  if (seenIds.has(c.id)) errors.push(`${at}: id 重复`);
  seenIds.add(c.id);

  if (BUILTIN_MEDIA.has(c.id)) warns.push(`${at}: media_* 为 serve 内置, 不应出现在 analysis 中`);
  if (!c.status) errors.push(`${at}: 缺 status`);
  else if (!VALID_STATUS.has(c.status)) errors.push(`${at}: status 非法 '${c.status}' (应为 verified/probe/broken)`);
  if (!c.safetyLevel) errors.push(`${at}: 缺 safetyLevel`);
  else if (!VALID_SAFETY.has(c.safetyLevel)) errors.push(`${at}: safetyLevel 非法 '${c.safetyLevel}'`);
  if (!c.sourceRef) errors.push(`${at}: 缺 sourceRef(可溯源)`);

  // description: LLM 选工具的第一信号
  if (!c.description) errors.push(`${at}: 缺 description`);
  else if (c.description.length < 15) warns.push(`${at}: description 过短(应有触发场景/参数语义)`);
  else if (!/[用户当让请要]/.test(c.description)) warns.push(`${at}: description 建议含触发场景提示("用户说X时用")`);

  // params
  const pnames = new Set();
  for (const [j, p] of (c.params ?? []).entries()) {
    const pat = `${at}.params[${j}]`;
    if (!p.name) { errors.push(`${pat}: 缺 name`); continue; }
    if (pnames.has(p.name)) errors.push(`${pat}: 参数名重复 '${p.name}'`);
    pnames.add(p.name);
    if (p.type && !VALID_TYPES.has(p.type)) warns.push(`${pat}: type '${p.type}' 非标准类型名`);
    if (p.optional !== undefined && typeof p.optional !== "boolean") errors.push(`${pat}: optional 应为 boolean`);
    if (p.enum !== undefined && (!Array.isArray(p.enum) || p.enum.length === 0)) errors.push(`${pat}: enum 应为非空数组`);
  }

  // 机制字段一致性
  const m = c.mechanism;
  if (!m) { warns.push(`${at}: 缺 mechanism(车端执行字段; serve 忽略但建议补全)`); }
  else if (!VALID_MECH.has(m)) { errors.push(`${at}: mechanism 非法 '${m}'`); }
  else if (m === "execmd") {
    if (!c.servicePackage || !c.serviceClass) errors.push(`${at}: execmd 缺 servicePackage/serviceClass`);
    if (!c.methodName) errors.push(`${at}: execmd 缺 methodName`);
    if (c.pattern && !["none", "scalar", "dataclass", "envelope"].includes(c.pattern)) errors.push(`${at}: pattern 非法 '${c.pattern}'`);
    if (c.pattern === "dataclass" && !c.dataClass) warns.push(`${at}: dataclass 建议声明 dataClass`);
    for (const dp of c.devicePaths ?? []) {
      // 执行器按路径末段解析设备源；声明和内置 resolver 必须同时覆盖该名称。
      const segs = dp.split(".");
      const source = segs.at(-1);
      if (!source || !deviceSources.has(source))
        errors.push(`${at}: devicePaths '${dp}' 未引用 app.deviceSources 中的设备源(${[...deviceSources].join("/") || "无"})`);
      else if (!EXECUTOR_DEVICE_SOURCES.has(source))
        errors.push(`${at}: devicePaths '${dp}' 使用了执行器不支持的设备源 '${source}'`);
    }
  } else if (m === "carcontrol") {
    if (!c.servicePackage || !c.serviceClass) errors.push(`${at}: carcontrol 缺 servicePackage/serviceClass`);
    if (!c.ccFunction) errors.push(`${at}: carcontrol 缺 ccFunction`);
  } else if (m === "mapnav") {
    if (!c.servicePackage || !c.serviceClass) errors.push(`${at}: mapnav 缺 servicePackage/serviceClass`);
    if (!c.bindAction) warns.push(`${at}: mapnav 建议声明 bindAction(部分服务要求 action 匹配)`);
  } else if (m === "aidl") {
    if (!c.servicePackage || !c.serviceClass) errors.push(`${at}: aidl 缺 servicePackage/serviceClass`);
    if (!c.interfaceClass) errors.push(`${at}: aidl 缺 interfaceClass`);
  } else if (m === "intent") {
    if (!c.component && !c.intentScreens) errors.push(`${at}: intent 至少需要 component 或 intentScreens`);
    if (c.intentScreens && (!c.intentScreens.pkg || !c.intentScreens.byDisplay || Object.keys(c.intentScreens.byDisplay).length === 0)) {
      errors.push(`${at}: intentScreens 需要 pkg 和非空 byDisplay`);
    }
  }
}

// 报告
console.log(`capabilities: ${caps.length} | active(非 broken): ${caps.filter((c) => c.status !== "broken").length} | serve 工具面(含 4 media): ${caps.filter((c) => c.status !== "broken").length + 4}`);
if (errors.length) {
  console.error(`\n✗ ${errors.length} 个错误:`);
  for (const e of errors) console.error("  - " + e);
}
if (warns.length) {
  console.log(`\n△ ${warns.length} 个建议:`);
  for (const w of warns) console.log("  - " + w);
}
console.log(errors.length ? "\n结果: FAIL" : "\n结果: PASS");
process.exit(errors.length ? 1 : 0);
