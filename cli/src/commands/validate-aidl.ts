import { parseAidlMethods, detectAdapterPattern, parseDataClasses, type Pattern } from "../aidl-source.js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

/** registry.json shape emitted by generateAidlRegistry (the car executor's dispatch table). */
export interface RegistryTool {
  readonly id: string;
  readonly methodName: string;
  readonly pattern: Pattern;
  readonly dataClass?: string;
  readonly devicePaths: readonly string[];
  readonly form?: string;
  readonly status?: string;
  readonly sourceRef?: string;
}
export interface Registry {
  readonly app: string;
  readonly framework?: string;
  readonly nativeCallTool?: boolean;
  readonly deviceSources?: readonly string[];
  readonly tools: readonly RegistryTool[];
}
export interface GateResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

/** Gate A — provenance & coverage. Reads AIDL + adapter source. Each tool's methodName must be a real
 *  AIDL business method, methodNames distinct, and the declared pattern must literally match how the
 *  adapter parses paramJson. Coverage is tool→method only (curate may select a subset); AIDL methods
 *  with no tool are surfaced as warnings, not errors. */
export function validateAidlProvenance(registry: Registry, sources: { aidlText: string; adapterText: string }): GateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const aidlMethods = parseAidlMethods(sources.aidlText);
  const tooled = new Set<string>();
  for (const t of registry.tools) {
    if (tooled.has(t.methodName)) errors.push(`${t.id}: duplicate methodName ${t.methodName}`);
    tooled.add(t.methodName);
    if (!aidlMethods.has(t.methodName)) errors.push(`${t.id}: methodName ${t.methodName} not in AIDL`);
    const detected = detectAdapterPattern(sources.adapterText, t.methodName);
    if (detected === undefined) errors.push(`${t.id}: method ${t.methodName} not found in adapter source`);
    else if (detected !== t.pattern) errors.push(`${t.id}: declared pattern "${t.pattern}" mismatches adapter parse "${detected}"`);
  }
  for (const m of aidlMethods) if (!tooled.has(m)) warnings.push(`AIDL method ${m} has no tool (may be intentional via curate selection)`);
  return { valid: errors.length === 0, errors, warnings };
}

/** Gate B — constructibility. Reads Types.kt. Two distinct real-failure classes:
 *  (1) dataclass-pattern tool's dataClass (the T in fromJson<T>) must exist in Types.kt;
 *  (2) each devicePath's leaf must be a declared app.deviceSources (else the executor would inject an
 *  undeclared device value → silent fail-closed or leak at runtime). */
export function validateAidlConstructibility(registry: Registry, sources: { typesKtText: string }): GateResult {
  const errors: string[] = [];
  const classes = parseDataClasses(sources.typesKtText);
  const deviceSources = new Set(registry.deviceSources ?? []);
  for (const t of registry.tools) {
    if (t.pattern === "dataclass") {
      if (!t.dataClass) errors.push(`${t.id}: dataclass pattern but no dataClass declared`);
      else if (!classes.has(t.dataClass)) errors.push(`${t.id}: dataClass ${t.dataClass} not found in Types.kt`);
    }
    for (const path of t.devicePaths) {
      const leaf = path.split(".").pop()!;
      if (!deviceSources.has(leaf)) errors.push(`${t.id}: devicePath ${path} leaf "${leaf}" not in app.deviceSources [${[...deviceSources].join(", ")}]`);
    }
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}

/** CLI: validate_aidl <registry.json> --aidl <I*.aidl> --adapter <Adapter.kt> --types <Types.kt>.
 *  Runs Gate A + Gate B against real source. Output is the agent feedback loop: on failure it names
 *  each capability id + the analysis field to fix, so the host agent can correct and re-run. */
export async function validateAidlCommand(args: string[]): Promise<void> {
  const registryPath = args.find((a) => !a.startsWith("--"));
  const flag = (n: string): string | undefined => { const i = args.indexOf(n); return i !== -1 ? args[i + 1] : undefined; };
  const aidlPath = flag("--aidl"), adapterPath = flag("--adapter"), typesPath = flag("--types");
  if (!registryPath || !aidlPath || !adapterPath || !typesPath) {
    throw new Error("Usage: mcp-pipeline validate_aidl <registry.json> --aidl <I*.aidl> --adapter <Adapter.kt> --types <Types.kt>");
  }
  const registry = JSON.parse(readFileSync(resolve(registryPath), "utf-8")) as Registry;
  const aidlText = readFileSync(resolve(aidlPath), "utf-8");
  const adapterText = readFileSync(resolve(adapterPath), "utf-8");
  const typesKtText = readFileSync(resolve(typesPath), "utf-8");

  const a = validateAidlProvenance(registry, { aidlText, adapterText });
  const b = validateAidlConstructibility(registry, { typesKtText });
  const errors = [...a.errors, ...b.errors];
  const appName = registry.app;
  let state = readState(appName) ?? createInitialState(appName, resolve(registryPath));
  try { state = updateStep(state, "validate_aidl", { status: errors.length ? "failed" : "completed", error: errors.length ? errors.join("\n") : undefined }); writeState(state); } catch { /* state is best-effort */ }

  if (errors.length === 0) {
    const warn = a.warnings.length
      ? `\n${a.warnings.length} AIDL method(s) have no tool (informational; curate may have selected a subset).`
      : "";
    process.stdout.write(`AIDL valid — ${registry.tools.length} tool(s); provenance + constructibility green.${warn}\n`);
    return;
  }
  throw new Error(`AIDL invalid — fix the named capability field(s) in analysis, re-run scaffold, then validate_aidl:\n${errors.map((e) => "  " + e).join("\n")}`);
}
