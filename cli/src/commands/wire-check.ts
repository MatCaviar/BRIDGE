import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { constructDbusCall } from "@im/mcp-server-framework";
import { readState, writeState, createInitialState, updateStep, appNameFromProjectDir } from "../state/manager.js";

export interface ExpectedWire { readonly method: string; readonly arg: { readonly funcName: string } }

/** 静态解析 proxy 共用模式：createMethodCallMessage("m") ... funcName: "f" */
export function extractExpectedWire(src: string): ExpectedWire[] {
  const out: ExpectedWire[] = [];
  const re = /createMethodCallMessage\(\s*"([^"]+)"\s*\)[\s\S]{0,400}?funcName:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) out.push({ method: m[1], arg: { funcName: m[2] } });
  return out;
}

export interface WireCheckResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Proxy methods/funcNames neither wired nor matched — informational surface-coverage report. Catches
   *  forgotten capabilities. NOT errors: may legitimately include intentionally-deferred/internal methods
   *  (deferred ops have no config wire, so their method appears here). */
  readonly uncovered?: readonly string[];
}

export function wireCheck(config: unknown, proxySource: string): WireCheckResult {
  const errors: string[] = [];
  const cfg = config as Record<string, any>;
  const wires = extractExpectedWire(proxySource);
  const hasConcreteDbus = Object.entries(cfg).some(([opId, entry]) => opId !== "_deferred" && entry?.type === "dbus");
  // funcName-convention proxies (AudioPolicyProxy) yield wires for forward checking. method-convention
  // proxies (IMAudio/MAF: createMethodCallMessage("<methodName>") with no funcName) yield none — their
  // verification is reverse-only. Fail-closed only when there is NO dbus pattern at all.
  if (hasConcreteDbus && wires.length === 0 && !/createMethodCallMessage\(\s*"/.test(proxySource)) {
    errors.push("no createMethodCallMessage(...) patterns found in proxy source — cannot verify any wire");
  }
  // Forward (proxy → config): every wire the proxy declares must be in config with matching method/funcName.
  for (const w of wires) {
    const opEntry = Object.values(cfg).find((s: any) => s?.arg?.funcName === w.arg.funcName);
    if (!opEntry) { errors.push(`proxy funcName "${w.arg.funcName}" not found in config`); continue; }
    try {
      const call = constructDbusCall(opEntry as any, {});
      const arg = JSON.parse(call.argString);
      if (arg.funcName !== w.arg.funcName || call.method !== w.method) errors.push(`wire mismatch for ${w.arg.funcName}`);
    } catch (e) { errors.push(`construct failed for ${w.arg.funcName}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  // Reverse (config → proxy): every non-_deferred dbus op's wire identifier must appear in the proxy
  // source. The identifier is `arg.funcName` for the AudioPolicyProxy convention, OR `method` for the
  // IMAudio/MAF convention (where method IS the call name — e.g. createMethodCallMessage("queryThing")).
  // Either is a valid real-wire anchor. Catches invented wires the forward direction silently ignores.
  // Multi-proxy safe — wireCheckCommand joins every --proxy source, so the identifier only needs to live
  // in ONE real proxy.
  for (const [opId, entry] of Object.entries(cfg)) {
    if (opId === "_deferred") continue;
    const spec = entry as any;
    if (spec?.type !== "dbus") continue;
    const ident = spec?.arg?.funcName ?? spec?.method;
    if (!ident) { errors.push(`config op "${opId}" is type dbus but has neither arg.funcName nor method`); continue; }
    if (!proxySource.includes(`"${ident}"`)) {
      errors.push(`config op "${opId}" wire identifier "${ident}" not found in passed proxy source(s) — either invented, or you did not pass this op's proxy (apps spanning several proxies must pass ALL via repeated --proxy); if not a real dbus call, declare it in _deferred`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export interface ProxyFile { readonly name: string; readonly src: string }

/** Per-file provenance wire check: stronger than wireCheck (joined substring). For each non-_deferred dbus
 *  op, its bus/path/interface must co-occur as quoted literals in the SAME proxy file that declares the op's
 *  method/funcName. Catches wrong-service (method in proxy A, bus from proxy B) and wrong-interface wiring
 *  (e.g. defaulting to `bus+".interface"` when the proxy uses the bare bus name) — the highest-value class
 *  of invented/mis-wired dbus that a substring union check silently passes. */
export function wireCheckProvenance(config: unknown, proxies: readonly ProxyFile[]): WireCheckResult {
  const errors: string[] = [];
  const cfg = config as Record<string, any>;
  const allWires = proxies.flatMap((p) => extractExpectedWire(p.src));
  const hasAnyMethodCall = proxies.some((p) => /createMethodCallMessage\(\s*"/.test(p.src));
  const hasConcreteDbus = Object.entries(cfg).some(([opId, entry]) => opId !== "_deferred" && entry?.type === "dbus");
  if (hasConcreteDbus && allWires.length === 0 && !hasAnyMethodCall) {
    errors.push("no createMethodCallMessage(...) patterns found in any proxy source — cannot verify any wire");
  }
  // Forward (proxy → config): every declared funcName-wire must be in config with matching method/funcName.
  for (const w of allWires) {
    const opEntry = Object.values(cfg).find((s: any) => s?.arg?.funcName === w.arg.funcName);
    if (!opEntry) { errors.push(`proxy funcName "${w.arg.funcName}" not found in config`); continue; }
    try {
      const call = constructDbusCall(opEntry as any, {});
      const arg = JSON.parse(call.argString);
      if (arg.funcName !== w.arg.funcName || call.method !== w.method) errors.push(`wire mismatch for ${w.arg.funcName}`);
    } catch (e) { errors.push(`construct failed for ${w.arg.funcName}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  // Reverse with co-occurrence provenance.
  for (const [opId, entry] of Object.entries(cfg)) {
    if (opId === "_deferred") continue;
    const spec = entry as any;
    if (spec?.type !== "dbus") continue;
    const ident = spec?.arg?.funcName ?? spec?.method;
    if (!ident) { errors.push(`config op "${opId}" is type dbus but has neither arg.funcName nor method`); continue; }
    const declFiles = proxies.filter((p) => p.src.includes(`"${ident}"`));
    if (declFiles.length === 0) {
      errors.push(`config op "${opId}" wire identifier "${ident}" not declared in any passed proxy — invented, or its proxy wasn't passed (apps spanning several proxies must pass ALL via repeated --proxy); if not a real dbus call, declare it in _deferred`);
      continue;
    }
    const coOccurs = (lit: string) => declFiles.some((p) => p.src.includes(`"${lit}"`));
    if (spec.bus && !coOccurs(spec.bus)) errors.push(`op "${opId}" bus "${spec.bus}" not found in the proxy declaring "${ident}" — wrong service?`);
    if (spec.path && !coOccurs(spec.path)) errors.push(`op "${opId}" path "${spec.path}" not found in the proxy declaring "${ident}"`);
    if (spec.interface && !coOccurs(spec.interface)) errors.push(`op "${opId}" interface "${spec.interface}" not found in the proxy declaring "${ident}" — proxies may use the bare bus name as interface, not bus+".interface"`);
  }
  // Surface coverage (informational): proxy methods/funcNames that no config op wires. Surfaces forgotten
  // capabilities. Not an error — deferred ops have no config wire, so their method legitimately appears.
  const proxyMethods = new Set<string>();
  const proxyFuncNames = new Set<string>();
  for (const p of proxies) {
    for (const mm of p.src.matchAll(/createMethodCallMessage\(\s*"([^"]+)"\s*\)/g)) proxyMethods.add(mm[1]);
    for (const w of extractExpectedWire(p.src)) proxyFuncNames.add(w.arg.funcName);
  }
  const configMethods = new Set<string>();
  const configFuncNames = new Set<string>();
  for (const [opId, entry] of Object.entries(cfg)) {
    if (opId === "_deferred") continue;
    const spec = entry as any;
    if (spec?.type !== "dbus") continue;
    if (spec.method) configMethods.add(spec.method);
    if (spec.arg?.funcName) configFuncNames.add(spec.arg.funcName);
  }
  const uncovered = [
    ...[...proxyMethods].filter((m) => !configMethods.has(m)),
    ...[...proxyFuncNames].filter((f) => !configFuncNames.has(f)),
  ];
  return { valid: errors.length === 0, errors, uncovered };
}

export async function wireCheckCommand(args: string[]): Promise<void> {
  // Collect ALL --proxy values — an app may span multiple proxies (e.g. AudioPolicyProxy + IMAudio + MAF).
  // Each is kept as a SEPARATE file so wireCheckProvenance can require bus/path/interface to co-occur in the
  // SAME proxy that declares the method (catches wrong-service / wrong-interface wiring a joined-source
  // substring check can never see).
  const proxyPaths: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--proxy" && i + 1 < args.length) { proxyPaths.push(args[i + 1]); i++; }
  }
  const proxyValueSet = new Set(proxyPaths);
  const configPath = args.find((a) => !a.startsWith("--") && !proxyValueSet.has(a));
  if (!configPath || proxyPaths.length === 0) throw new Error("Usage: mcp-pipeline wire_check <config.json> --proxy <proxy.ts> [--proxy <proxy2.ts> ...]");
  const config = JSON.parse(readFileSync(resolve(configPath), "utf-8"));
  const proxies = proxyPaths.map((p) => ({ name: p, src: readFileSync(resolve(p), "utf-8") }));
  const result = wireCheckProvenance(config, proxies);
  const appName = appNameFromProjectDir(dirname(dirname(resolve(configPath))));
  let state = readState(appName) ?? createInitialState(appName, resolve(configPath));
  try { state = updateStep(state, "wire_check", { status: result.valid ? "completed" : "failed", error: result.valid ? undefined : result.errors.join("\n") }); writeState(state); } catch {}
  if (result.valid) {
    process.stdout.write(`Wire check passed\n`);
    if (result.uncovered && result.uncovered.length > 0) {
      process.stdout.write(`Surface coverage (informational — review; may include intentionally deferred/internal methods): ${result.uncovered.length} proxy method(s) not wired: ${result.uncovered.join(", ")}\n`);
    }
    return;
  }
  throw new Error(`Wire check failed:\n${result.errors.join("\n")}`);
}
