import { readFileSync } from "fs";
import { resolve } from "path";
import { constructDbusCall, constructNativeCall } from "@im/mcp-server-framework";
import type { AnalysisData, ParamDef } from "../types.js";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

export interface ValidateConfigResult { readonly valid: boolean; readonly errors: readonly string[]; readonly deferred: readonly string[] }

/** Synthesize realistic sample args for the dispatchability dry-run. General (no app coupling):
 *  honors `defaultValue`; arrays → `[]`; objects/named models → `{}`; named enums resolve to their first
 *  wire value; number/boolean/string get typed primitives. Optional params are skipped. */
export function sampleArgs(
  params: readonly ParamDef[] | undefined,
  enums?: Record<string, { readonly values: readonly string[]; readonly type: string }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params ?? []) {
    if (p.optional) continue;
    if (p.defaultValue !== undefined) { out[p.name] = p.defaultValue; continue; }
    if (/\[\]$/.test(p.type) || /^Array</.test(p.type)) { out[p.name] = []; continue; }
    if (p.enum && p.enum.length && p.type === "number") out[p.name] = Number(p.enum[0]);
    else if (p.enum && p.enum.length && p.type === "boolean") out[p.name] = p.enum[0] === "true";
    else if (p.enum && p.enum.length) out[p.name] = p.enum[0];
    else if (enums && enums[p.type]) {
      const ev = enums[p.type];
      out[p.name] = ev.type === "number" ? Number(ev.values[0]) : ev.values[0];
    }
    else if (p.type === "number") out[p.name] = 1;
    else if (p.type === "boolean") out[p.name] = true;
    else if (p.type === "string") out[p.name] = "x";
    else out[p.name] = {};
  }
  return out;
}

function collectTemplateVars(value: unknown, out = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const match of value.matchAll(/\$\{([\w.]+)\}/g)) out.add(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) collectTemplateVars(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) collectTemplateVars(item, out);
  }
  return out;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateSpecShape(capId: string, spec: any): string[] {
  const errors: string[] = [];
  if (spec?.type === "dbus") {
    if (!nonEmptyString(spec.bus)) errors.push(`${capId}: dbus.bus must be a non-empty string`);
    if (!nonEmptyString(spec.path)) errors.push(`${capId}: dbus.path must be a non-empty string`);
    if (!nonEmptyString(spec.method)) errors.push(`${capId}: dbus.method must be a non-empty string`);
    if (!["json", "string", "int", "double", "bool"].includes(spec.reply)) {
      errors.push(`${capId}: dbus.reply must be one of json,string,int,double,bool`);
    }
    const hasWrites = Array.isArray(spec.writes) && spec.writes.length > 0;
    if (spec.arg === undefined && !hasWrites) errors.push(`${capId}: dbus.arg (or writes[]) is required`);
    if (hasWrites) {
      const validKinds = new Set(["string", "int32", "double", "bool", "json"]);
      for (let i = 0; i < spec.writes.length; i++) {
        const w = spec.writes[i];
        if (!w || !validKinds.has(w.kind)) errors.push(`${capId}: writes[${i}].kind must be one of string,int32,double,bool,json`);
        if (w && w.value === undefined) errors.push(`${capId}: writes[${i}].value is required`);
      }
    }
    if (spec.replyParts !== undefined) {
      const validReadKinds = new Set(["json", "string", "int32", "double", "bool"]);
      if (!Array.isArray(spec.replyParts) || spec.replyParts.length === 0) errors.push(`${capId}: replyParts must be a non-empty array`);
      else for (let i = 0; i < spec.replyParts.length; i++) {
        if (!spec.replyParts[i] || !validReadKinds.has(spec.replyParts[i].kind)) errors.push(`${capId}: replyParts[${i}].kind must be one of json,string,int32,double,bool`);
      }
    }
  } else if (spec?.type === "native") {
    if (!nonEmptyString(spec.require)) errors.push(`${capId}: native.require must be a non-empty string`);
    if (!nonEmptyString(spec.method)) errors.push(`${capId}: native.method must be a non-empty string`);
    if (!Array.isArray(spec.args)) errors.push(`${capId}: native.args must be an array`);
  }
  return errors;
}

export function validateConfig(config: unknown, analysis: AnalysisData): ValidateConfigResult {
  const errors: string[] = [];
  if (!config || typeof config !== "object") return { valid: false, errors: ["config is not an object"], deferred: [] };
  const cfg = config as Record<string, unknown>;
  const capabilityIds = new Set(analysis.capabilities.map((cap) => cap.id));
  const deferredRaw = cfg._deferred;
  const deferred: readonly string[] = deferredRaw && typeof deferredRaw === "object" && !Array.isArray(deferredRaw)
    ? Object.keys(deferredRaw as Record<string, unknown>)
    : [];
  for (const opId of Object.keys(cfg)) {
    if (opId !== "_deferred" && !capabilityIds.has(opId)) errors.push(`unknown config op: ${opId}`);
  }
  for (const opId of deferred) {
    if (!capabilityIds.has(opId)) errors.push(`unknown _deferred capability: ${opId}`);
  }
  if (analysis.capabilities.length === 0) errors.push("analysis has no capabilities — nothing to wire");
  for (const cap of analysis.capabilities) {
    if (deferred.includes(cap.id)) continue;
    if (!cfg[cap.id]) errors.push(`missing op for capability: ${cap.id}`);
  }
  const deviceSources = new Set((analysis.app as { deviceSources?: readonly string[] }).deviceSources ?? []);
  for (const cap of analysis.capabilities) {
    const spec = cfg[cap.id] as any;
    if (!spec) continue;
    errors.push(...validateSpecShape(cap.id, spec));
    const paramNames = new Set((cap.params ?? []).map((p) => p.name));
    for (const name of collectTemplateVars(spec)) {
      if (name.startsWith("__device__.")) {
        const src = name.slice("__device__.".length);
        if (!deviceSources.has(src)) errors.push(`${cap.id}: undeclared device source ${name} (add to app.deviceSources)`);
        continue;
      }
      if (!paramNames.has(name)) errors.push(`${cap.id}: unknown template variable ${name}`);
    }
    try {
      const args = sampleArgs(cap.params, analysis.enums);
      // 注入 __device__ 占位桶，使 device-var spec 的 dispatchability 干跑不会因未解析而误判
      // （真值由车端运行时解析；此处仅需证明 wire 可构造）。
      if (deviceSources.size > 0) (args as Record<string, unknown>).__device__ = Object.fromEntries([...deviceSources].map((s) => [s, "DEV"]));
      if (spec.type === "dbus") constructDbusCall(spec, args);
      else if (spec.type === "native") constructNativeCall(spec, args);
      else errors.push(`${cap.id}: unknown spec.type ${spec.type}`);
    } catch (e) {
      errors.push(`${cap.id}: not dispatchable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { valid: errors.length === 0, errors, deferred };
}

export async function validateConfigCommand(args: string[]): Promise<void> {
  const configPath = args.find((a) => !a.startsWith("--"));
  const analysisFlag = args.indexOf("--analysis");
  if (!configPath || analysisFlag === -1) throw new Error("Usage: mcp-pipeline validate_config <config.json> --analysis <analysis.json>");
  const config = JSON.parse(readFileSync(resolve(configPath), "utf-8"));
  const analysis = JSON.parse(readFileSync(resolve(args[analysisFlag + 1]), "utf-8")) as AnalysisData;
  const appName = analysis.app.name;
  let state = readState(appName) ?? createInitialState(appName, resolve(configPath));
  const result = validateConfig(config, analysis);
  try { state = updateStep(state, "validate_config", { status: result.valid ? "completed" : "failed", error: result.valid ? undefined : result.errors.join("\n") }); writeState(state); } catch {}
  if (result.valid) {
    const opCount = Object.keys(config as Record<string, unknown>).filter((k) => k !== "_deferred").length;
    const deferredNote = result.deferred.length ? ` (${result.deferred.length} deferred: ${result.deferred.join(", ")})` : "";
    // Judgment aid — hand the boundary back to the host agent. "valid" here means dispatchable, NOT wire-correct.
    process.stdout.write(
      `Config valid — ${opCount} op(s) dispatchable${deferredNote}.\n` +
      `NOTE: this gate confirms schema + coverage + dispatchability ONLY. It does NOT verify each op's wire\n` +
      `matches real source. For each op, confirm its funcName traces to a real proxy call — wire_check helps,\n` +
      `but the final judgment is YOURS (read the proxy source; do not treat "valid" here as "wire-correct").\n`
    );
    return;
  }
  throw new Error(`Config invalid:\n${result.errors.join("\n")}`);
}
