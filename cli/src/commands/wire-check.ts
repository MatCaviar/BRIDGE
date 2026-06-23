import { readFileSync } from "fs";
import { resolve } from "path";
import { constructDbusCall } from "@im/mcp-server-framework";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

export interface ExpectedWire { readonly method: string; readonly arg: { readonly funcName: string } }

/** 静态解析 proxy 共用模式：createMethodCallMessage("m") ... funcName: "f" */
export function extractExpectedWire(src: string): ExpectedWire[] {
  const out: ExpectedWire[] = [];
  const re = /createMethodCallMessage\(\s*"([^"]+)"\s*\)[\s\S]{0,400}?funcName:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ method: m[1], arg: { funcName: m[2] } });
  return out;
}

export interface WireCheckResult { readonly valid: boolean; readonly errors: readonly string[] }

export function wireCheck(config: unknown, proxySource: string): WireCheckResult {
  const errors: string[] = [];
  const cfg = config as Record<string, any>;
  for (const w of extractExpectedWire(proxySource)) {
    const opEntry = Object.values(cfg).find((s: any) => s?.arg?.funcName === w.arg.funcName);
    if (!opEntry) { errors.push(`proxy funcName "${w.arg.funcName}" not found in config`); continue; }
    try {
      const call = constructDbusCall(opEntry as any, {});
      const arg = JSON.parse(call.argString);
      if (arg.funcName !== w.arg.funcName || call.method !== w.method) errors.push(`wire mismatch for ${w.arg.funcName}`);
    } catch (e) { errors.push(`construct failed for ${w.arg.funcName}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { valid: errors.length === 0, errors };
}

export async function wireCheckCommand(args: string[]): Promise<void> {
  const configPath = args.find((a) => !a.startsWith("--") && !a.startsWith("--proxy"));
  const proxyFlag = args.indexOf("--proxy");
  if (!configPath || proxyFlag === -1) throw new Error("Usage: mcp-pipeline wire-check <config.json> --proxy <proxy.ts>");
  const config = JSON.parse(readFileSync(resolve(configPath), "utf-8"));
  const proxySrc = readFileSync(resolve(args[proxyFlag + 1]), "utf-8");
  const result = wireCheck(config, proxySrc);
  const appName = "app";
  let state = readState(appName) ?? createInitialState(appName, resolve(configPath));
  try { state = updateStep(state, "wire_check", { status: result.valid ? "completed" : "failed", error: result.valid ? undefined : result.errors.join("\n") }); writeState(state); } catch {}
  if (result.valid) { process.stdout.write(`Wire check passed\n`); return; }
  throw new Error(`Wire check failed:\n${result.errors.join("\n")}`);
}
