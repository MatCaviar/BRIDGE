import { readFileSync } from "fs";
import { resolve } from "path";
import { constructDbusCall, constructNativeCall } from "@im/mcp-server-framework";
import type { AnalysisData, ParamDef } from "../types.js";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

export interface ValidateConfigResult { readonly valid: boolean; readonly errors: readonly string[]; readonly deferred: readonly string[] }

export function sampleArgs(params: readonly ParamDef[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const p of params ?? []) {
    if (p.optional) continue;
    if (p.enum && p.enum.length) out[p.name] = p.enum[0];
    else if (p.type === "number") out[p.name] = 1;
    else if (p.type === "boolean") out[p.name] = true;
    else out[p.name] = "x";
  }
  return out;
}

export function validateConfig(config: unknown, analysis: AnalysisData): ValidateConfigResult {
  const errors: string[] = [];
  if (!config || typeof config !== "object") return { valid: false, errors: ["config is not an object"], deferred: [] };
  const cfg = config as Record<string, unknown>;
  const deferredRaw = cfg._deferred;
  const deferred: readonly string[] = deferredRaw && typeof deferredRaw === "object" && !Array.isArray(deferredRaw)
    ? Object.keys(deferredRaw as Record<string, unknown>)
    : [];
  for (const cap of analysis.capabilities) {
    if (deferred.includes(cap.id)) continue;
    if (!cfg[cap.id]) errors.push(`missing op for capability: ${cap.id}`);
  }
  for (const cap of analysis.capabilities) {
    const spec = cfg[cap.id] as any;
    if (!spec) continue;
    try {
      const args = sampleArgs(cap.params);
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
  if (!configPath || analysisFlag === -1) throw new Error("Usage: mcp-pipeline validate-config <config.json> --analysis <analysis.json>");
  const config = JSON.parse(readFileSync(resolve(configPath), "utf-8"));
  const analysis = JSON.parse(readFileSync(resolve(args[analysisFlag + 1]), "utf-8")) as AnalysisData;
  const appName = analysis.app.name;
  let state = readState(appName) ?? createInitialState(appName, resolve(configPath));
  const result = validateConfig(config, analysis);
  try { state = updateStep(state, "validate_config", { status: result.valid ? "completed" : "failed", error: result.valid ? undefined : result.errors.join("\n") }); writeState(state); } catch {}
  if (result.valid) { process.stdout.write(`Config valid${result.deferred.length ? ` (${result.deferred.length} deferred: ${result.deferred.join(", ")})` : ""}\n`); return; }
  throw new Error(`Config invalid:\n${result.errors.join("\n")}`);
}
