import { readFileSync } from "node:fs";
import { z } from "zod";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatResponse, normalizeResponse } from "../utils/response.js";
import type { AnalysisData, CapabilityDef, FieldShape, ParamDef } from "../types.js";
import { CliAdb } from "../car/adb.js";
import { invokeTool, type InvokeOptions, type InvokeResult } from "./invoke.js";
import { activeCapabilities, arrayItemShape, normalizedEnum, normalizedJsonType, publicParams, toolDefinitions } from "./schema.js";

export interface ServeOptions extends Pick<InvokeOptions, "user" | "pkg" | "activity" | "timeoutMs"> {
  readonly analysisPath: string;
  readonly device?: string;
  readonly includeBroken?: boolean;
  /** Trusted preconditions supplied by host code, never by model arguments. */
  readonly preconditions?: Readonly<Record<string, boolean>>;
  readonly preconditionsPath?: string;
}

export function inputSchemaFor(cap: CapabilityDef): Record<string, z.ZodTypeAny> {
  return paramsToZodShape(cap.params ?? []);
}

function paramsToZodShape(ps: readonly ParamDef[], required?: readonly string[]): Record<string, z.ZodTypeAny> {
  return Object.fromEntries(ps.map(p => {
    let s = fieldZod(p);
    if (p.defaultValue !== undefined) s = s.default(p.defaultValue);
    else if (required !== undefined ? !required.includes(p.name) : p.optional) s = s.optional();
    return [p.name, s];
  }));
}

function fieldZod(p: FieldShape): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  const t = normalizedJsonType(p.type);
  if (t === "array") {
    const item = arrayItemShape(p);
    let arr = z.array(item ? fieldZod(item) : z.unknown());
    if (p.minItems !== undefined) arr = arr.min(p.minItems);
    if (p.maxItems !== undefined) arr = arr.max(p.maxItems);
    s = arr;
  } else if (t === "object") {
    const obj = z.object(paramsToZodShape(p.properties ?? [], p.required));
    s = p.additionalProperties ? obj.passthrough() : obj.strict();
  } else if (t === "number" || t === "integer") {
    let n = z.number().finite();
    if (t === "integer") n = n.int();
    if (p.minimum !== undefined) n = n.min(p.minimum);
    if (p.maximum !== undefined) n = n.max(p.maximum);
    s = n;
  } else if (t === "boolean") s = z.boolean();
  else {
    let str = z.string();
    if (p.minLength !== undefined) str = str.min(p.minLength);
    if (p.maxLength !== undefined) str = str.max(p.maxLength);
    if (p.pattern !== undefined) str = str.regex(new RegExp(p.pattern));
    s = str;
  }
  if (p.enum?.length && t !== "array") {
    const values = normalizedEnum(p)!;
    if (t === "string" && values.every(v => typeof v === "string") && p.pattern === undefined && p.minLength === undefined && p.maxLength === undefined) s = z.enum(values as [string,...string[]]);
    else s = s.refine(v => values.includes(v), "Value is outside declared enum");
  }
  if (p.description) s = s.describe(p.description);
  return s;
}

async function httpInvoke(analysis: AnalysisData, cap: CapabilityDef, args: Record<string, unknown>): Promise<InvokeResult> {
  const transport = analysis.transport!;
  const headers: Record<string,string> = { "Content-Type": "application/json" };
  for (const [header, env] of Object.entries(transport.headerEnv ?? {})) {
    const value = process.env[env];
    if (!value) throw new Error(`Missing transport environment variable: ${env}`);
    headers[header] = value;
  }
  const name = analysis.toolContract?.mode === "channel" ? analysis.toolContract.name! : cap.dispatch?.operation ?? cap.id;
  const started = Date.now();
  const response = await fetch(transport.url, { method: "POST", headers, body: JSON.stringify({ name, arguments: args }), signal: AbortSignal.timeout(transport.timeoutMs ?? 8000), redirect: "error" });
  const data = await response.json();
  return { reqId: "http", ok: response.ok, data, error: response.ok ? undefined : `HTTP_${response.status}`, elapsedMs: Date.now() - started };
}

/** tools/list and static export share exactly the same schemas. */
export function buildMcpServer(analysis: AnalysisData, opts: ServeOptions, invoke: typeof invokeTool = invokeTool): Server {
  const definitions = toolDefinitions(analysis, opts.includeBroken);
  const caps = activeCapabilities(analysis, opts.includeBroken);
  const server = new Server({ name: `bridge-${analysis.app.name}`, version: "0.2.0" }, { capabilities: { tools: {} } });
  const contract = analysis.toolContract;
  const channel = contract?.mode === "channel";
  const actionField = contract?.actionField ?? "action";
  const contextField = contract?.contextField ?? "extras";
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: definitions as any }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const name = request.params.name;
      if (!definitions.some(t=>t.name === name)) throw new Error(`Unknown tool: ${name}`);
      const input = request.params.arguments ?? {};
      const cap = channel ? caps.find(c=>(c.publicAction ?? c.id) === input[actionField]) : caps.find(c=>c.id === name);
      if (!cap && channel) throw new Error("Unknown or unavailable channel action");
      const selected: CapabilityDef = cap ?? { id: name, domain: "media", object: "session", action: name, description: "Media control", safetyLevel: "normal", status: "probe", sourceRef: "builtin", params: [] };
      if (selected.status === 'broken') throw new Error('Capability is unavailable');
      const parsed = z.object(paramsToZodShape(publicParams(analysis, selected, channel))).strict().parse(input);
      const context = { ...((parsed[contextField] ?? {}) as Record<string,unknown>) };
      for (const [key, binding] of Object.entries(contract?.contextBindings ?? {})) {
        const value = process.env[binding.env];
        if (value === undefined) throw new Error(`Missing context environment variable: ${binding.env}`);
        const field = contract!.context!.find(p => p.name === key)!;
        if (normalizedJsonType(field.type) === 'string') context[key] = value;
        else { try { context[key] = JSON.parse(value); } catch { throw new Error(`Context variable ${binding.env} must contain valid JSON for ${field.type}`); } }
      }
      if (contract?.context?.length) parsed[contextField] = z.object(paramsToZodShape(contract.context)).strict().parse(context);
      const requirements = [...(selected.preconditions ?? [])];
      if (selected.safetyLevel.startsWith("p_gear")) requirements.push("park");
      if (selected.safetyLevel.includes("confirm")) requirements.push("confirmed");
      if (selected.safetyLevel.includes("network")) requirements.push("network");
      let trusted = opts.preconditions;
      if (requirements.length && opts.preconditionsPath) {
        const snapshot = JSON.parse(readFileSync(opts.preconditionsPath, 'utf8'));
        if (typeof snapshot.expiresAt !== 'number' || snapshot.expiresAt <= Date.now()) throw new Error('Precondition snapshot is missing or expired');
        trusted = snapshot.values;
      }
      for (const requirement of requirements) if (trusted?.[requirement] !== true) throw new Error(`Precondition not satisfied: ${requirement}`);
      const args: Record<string,unknown> = {};
      for (const p of selected.params ?? []) if (parsed[p.name] !== undefined) args[selected.dispatch?.parameterMap?.[p.name] ?? p.name] = parsed[p.name];
      if (contract?.context?.length && parsed[contextField] !== undefined) args[contextField] = parsed[contextField];
      if (channel && analysis.transport) args[actionField] = selected.dispatch?.operation ?? selected.publicAction ?? selected.id;
      const result = analysis.transport ? await httpInvoke(analysis, selected, args) : await invoke(new CliAdb(opts.device ?? "no-device"), {
        op: selected.dispatch?.operation ?? selected.id, args, device: opts.device ?? "no-device", user: opts.user, pkg: opts.pkg, activity: opts.activity, timeoutMs: opts.timeoutMs,
      });
      const normalized = normalizeResponse(result, contract?.response);
      return formatResponse(normalized.body, !normalized.ok);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return formatResponse({ code: error instanceof z.ZodError ? "INVALID_ARGUMENTS" : "BRIDGE_ERROR", message, data: {}, extras: {} }, true);
    }
  });
  return server;
}

export function parseServeArgs(argv: string[]): ServeOptions {
  const o: any = {};
  const keys: Record<string,string> = { "--analysis":"analysisPath", "--device":"device", "--user":"user", "--package":"pkg", "--activity":"activity", "--timeout":"timeoutMs", "--preconditions-file":"preconditionsPath" };
  for (let i=0;i<argv.length;i++) {
    if (argv[i] === "--include-broken") o.includeBroken = true;
    else if (keys[argv[i]]) { const key = keys[argv[i]]; const value = argv[++i]; if (!value) throw new Error("Missing argument value"); o[key] = ["user","timeoutMs"].includes(key) ? Number(value) : value; }
    else throw new Error(`Unknown serve option: ${argv[i]}`);
  }
  if (o.user !== undefined && (!Number.isInteger(o.user) || o.user < 0)) throw new Error('Invalid Android user');
  if (o.timeoutMs !== undefined && (!Number.isFinite(o.timeoutMs) || o.timeoutMs <= 0)) throw new Error('Invalid timeout');
  return o;
}

export async function serveCommand(argv: string[]): Promise<void> {
  const opts = parseServeArgs(argv);
  if (!opts.analysisPath) throw new Error("serve requires --analysis <analysis.json>");
  const analysis = JSON.parse(readFileSync(opts.analysisPath,"utf8")) as AnalysisData;
  if (!analysis.transport && !opts.device) throw new Error("ADB transport requires --device <serial>; HTTP transport is configured in analysis.json");
  await buildMcpServer(analysis, opts).connect(new StdioServerTransport());
}
