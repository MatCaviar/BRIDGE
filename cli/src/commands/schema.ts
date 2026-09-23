import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AnalysisData, CapabilityDef, FieldShape, ParamDef } from "../types.js";
import { assertAnalysis } from "../../../contract/analysis.mjs";

export type SchemaFormat = "bridge" | "mcp" | "openai" | "anthropic" | "contract" | "all";
export type JsonSchema = Record<string, unknown>;

export const MEDIA_BUILTINS = [
  { name: "media_next", description: "Control media playback: next on the active session" },
  { name: "media_prev", description: "Control media playback: previous on the active session" },
  { name: "media_play", description: "Control media playback: play on the active session" },
  { name: "media_pause", description: "Control media playback: pause on the active session" },
] as const;

export function normalizedJsonType(type: string): "string" | "integer" | "number" | "boolean" | "array" | "object" {
  const value = String(type || "string").trim().toLowerCase().replace(/\s+/g, "").replace(/\?$/, "");
  if (value.endsWith("[]") || /^(array|list|set)(<|\[|$)/.test(value)) return "array";
  if (/^(int|integer|long|short|byte|uint|ulong)/.test(value)) return "integer";
  if (/^(float|double|number|decimal)/.test(value)) return "number";
  if (/^(bool|boolean)/.test(value)) return "boolean";
  if (/^(object|map|record|dict)/.test(value)) return "object";
  return "string";
}

function genericItemType(type: string): string | undefined {
  const value = String(type || "").trim().replace(/\?$/, "");
  const generic = value.match(/^(?:Array|List|Set)\s*[<\[]\s*(.+?)\s*[>\]]$/i);
  if (generic?.[1]) return generic[1];
  const suffix = value.match(/^(.+?)\[\]$/);
  return suffix?.[1];
}

export function arrayItemShape(field: FieldShape): FieldShape | undefined {
  if (field.items) return field.items;
  const inferred = genericItemType(field.type);
  if (inferred) return { type: inferred, enum: field.enum };
  if (field.enum?.length) return { type: "string", enum: field.enum };
  return undefined;
}

export function normalizedEnum(field: FieldShape): readonly (string | number | boolean)[] | undefined {
  if (!field.enum?.length) return undefined;
  const type = normalizedJsonType(field.type);
  if (type === "integer" || type === "number") {
    const values = field.enum.map((value) => Number(value));
    return values.every(Number.isFinite) ? values : [...field.enum];
  }
  if (type === "boolean") {
    const values = field.enum.map((value) => String(value).toLowerCase() === "true" ? true : String(value).toLowerCase() === "false" ? false : value);
    return values;
  }
  return [...field.enum];
}

function objectSchema(properties: readonly ParamDef[] = [], explicitRequired?: readonly string[]): JsonSchema {
  const mapped: Record<string, JsonSchema> = {};
  for (const property of properties) mapped[property.name] = jsonSchemaForField(property);
  const required = explicitRequired !== undefined
    ? [...explicitRequired]
    : properties.filter((property) => !property.optional && property.defaultValue === undefined).map((property) => property.name);
  const schema: JsonSchema = { type: "object", properties: mapped, additionalProperties: false };
  if (required.length) schema.required = required;
  return schema;
}

export function jsonSchemaForField(field: FieldShape): JsonSchema {
  const type = normalizedJsonType(field.type);
  let schema: JsonSchema;
  if (type === "array") {
    const item = arrayItemShape(field);
    schema = { type: "array", items: item ? jsonSchemaForField(item) : {} };
  } else if (type === "object") {
    schema = objectSchema(field.properties, field.required);
    schema.additionalProperties = field.additionalProperties ?? false;
  } else {
    schema = { type };
    const enumValues = normalizedEnum(field);
    if (enumValues?.length) schema.enum = [...enumValues];
    if ((type === "integer" || type === "number") && field.minimum !== undefined) schema.minimum = field.minimum;
    if ((type === "integer" || type === "number") && field.maximum !== undefined) schema.maximum = field.maximum;
  }
  if (field.description) schema.description = field.description;
  for (const key of ["minLength", "maxLength", "pattern", "minItems", "maxItems"] as const) {
    if (field[key] !== undefined) schema[key] = field[key];
  }
  const param = field as Partial<ParamDef>;
  if (param.defaultValue !== undefined) schema.default = param.defaultValue;
  if (param.examples?.length) schema.examples = [...param.examples];
  return schema;
}

export function jsonSchemaFor(capability: CapabilityDef): JsonSchema {
  return objectSchema(capability.params ?? []);
}

export function annotationsForSafety(safetyLevel: string): Record<string, boolean> {
  const readOnly = safetyLevel === "readonly";
  const requiresConfirmation = /confirm/.test(safetyLevel);
  return {
    readOnlyHint: readOnly,
    destructiveHint: requiresConfirmation,
    idempotentHint: readOnly,
    openWorldHint: !readOnly,
  };
}

export function activeCapabilities(analysis: AnalysisData, includeBroken = false): readonly CapabilityDef[] {
  const scopes = analysis.deliveryScopes ?? ["core"];
  return (analysis.capabilities ?? []).filter((capability) => (includeBroken || capability.status !== "broken") && scopes.includes(capability.scope ?? "core"));
}

function friendlyType(field: FieldShape): string {
  const type = normalizedJsonType(field.type);
  if (type === "array") {
    const item = arrayItemShape(field);
    return `List[${item ? friendlyType(item) : "Any"}]`;
  }
  if (type === "integer") return "int";
  if (type === "number") return "float";
  if (type === "boolean") return "bool";
  if (type === "object") return "object";
  return "str";
}

function argumentSchema(param: ParamDef): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: friendlyType(param),
    required: !param.optional && param.defaultValue === undefined,
  };
  const options = normalizedJsonType(param.type) === "array"
    ? normalizedEnum(arrayItemShape(param) ?? param)
    : normalizedEnum(param);
  if (options?.length) result.options = [...options];
  if (param.description) result.description = param.description;
  if (param.defaultValue !== undefined) result.default = param.defaultValue;
  if (param.examples?.length) result.examples = [...param.examples];
  // Preserve the full recursive schema, including range and nested-object constraints.
  result.schema = jsonSchemaForField(param);
  for (const key of ["minimum", "maximum", "minLength", "maxLength", "pattern", "minItems", "maxItems"] as const) {
    if (param[key] !== undefined) result[key] = param[key];
  }
  if (param.properties) result.properties = Object.fromEntries(param.properties.map(p => [p.name, argumentSchema(p)]));
  if (param.items) result.items = jsonSchemaForField(param.items);
  return result;
}

export interface BridgeFunctionSchema {
  readonly name: string;
  readonly arguments: Readonly<Record<string, Record<string, unknown>>>;
  readonly description: string;
}

function bridgeFunctionFor(capability: CapabilityDef): BridgeFunctionSchema {
  const args: Record<string, Record<string, unknown>> = {};
  for (const param of capability.params ?? []) args[param.name] = argumentSchema(param);
  return { name: capability.id, arguments: args, description: capability.description };
}

export function bridgeFunctionArtifact(analysis: AnalysisData, includeBroken = false): Record<string, unknown> {
  const definitions = toolDefinitions(analysis, includeBroken);
  const suffix = analysis.toolContract?.mode === "channel" ? "" : contractDescriptionSuffix(analysis);
  const functions = definitions.map(tool => {
    const cap = activeCapabilities(analysis, includeBroken).find(c => c.id === tool.name);
    const base = cap && analysis.toolContract?.mode !== "channel" ? bridgeFunctionFor({ ...cap, params: publicParams(analysis, cap) }) : {
      name: tool.name, arguments: Object.fromEntries(Object.entries((tool.inputSchema.properties ?? {}) as Record<string, JsonSchema>).map(([name, schema]) => [name, {
        type: typeof schema.type === 'string' ? friendlyType({type:schema.type,items:schema.items as FieldShape|undefined}) : 'Any',
        ...(schema.enum ? {options:schema.enum} : {}), ...(schema.description ? {description:schema.description} : {}), schema,
      }])), description: tool.description,
    };
    return { ...base, description: (base.description ?? "") + (cap ? utteranceSuffix(cap) : "") + suffix, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema };
  });
  return {
    schemaVersion: "bridge.function-schema/v1",
    app: analysis.app,
    functions,
  };
}

export function mcpToolArtifact(analysis: AnalysisData, includeBroken = false): Record<string, unknown> {
  return { tools: toolDefinitions(analysis, includeBroken) };
}

/**
 * Renders the response code table (success + business errors) and channel metadata
 * (contract version, timeout, client package) into exported tool descriptions, so the
 * upstream agent sees the failure semantics of the channel envelope in-band.
 */
export function contractDescriptionSuffix(analysis: AnalysisData): string {
  const contract = analysis.toolContract;
  if (!contract) return "";
  const notes: string[] = [];
  const errorCodes = contract.response?.errorCodes ?? [];
  if (errorCodes.length || contract.response?.successCodes?.length) {
    const success = contract.response?.successCodes ?? [0];
    const codes = [
      ...success.map((code) => `${code}=success`),
      ...errorCodes.map((entry) => `${entry.code}=${entry.message}`),
    ];
    notes.push(`Response codes: ${codes.join("; ")}.`);
  }
  const meta = [
    contract.version ? `contract v${contract.version}` : "",
    contract.timeoutMs ? `timeout ${contract.timeoutMs}ms` : "",
    contract.clientPackage ? `client ${contract.clientPackage}` : "",
  ].filter(Boolean).join("; ");
  if (meta) notes.push(`Channel: ${meta}.`);
  return notes.length ? `\n\n${notes.join("\n")}` : "";
}

/**
 * Renders PRD-sourced example utterances into exported descriptions, so the upstream
 * agent can map user phrasings to the right action in-band.
 */
export function utteranceSuffix(capability: CapabilityDef): string {
  const utterances = capability.utterances ?? [];
  return utterances.length ? `\n\nExample utterances: ${utterances.map((u) => `"${u}"`).join(" ")}` : "";
}

export function publicParams(analysis: AnalysisData, capability: CapabilityDef, includeAction = false): readonly ParamDef[] {
  const contract = analysis.toolContract;
  const context = contract?.context ?? [];
  const exposedContext = context.map(p => contract?.contextBindings?.[p.name] ? { ...p, optional: true } : p);
  return [
    ...(includeAction ? [{ name: contract?.actionField ?? "action", type: "string", enum: [capability.publicAction ?? capability.id] }] : []),
    ...(capability.params ?? []),
    ...(context.length ? [{ name: contract?.contextField ?? "extras", type: "object", properties: exposedContext, optional: exposedContext.every(p => p.optional || p.defaultValue !== undefined) }] : []),
  ];
}

export const outputSchema: JsonSchema = {
  type: "object", properties: { code: { type: ["number", "string"] }, message: { type: "string" }, data: {}, extras: { type: "object" } },
  required: ["code", "message", "data", "extras"], additionalProperties: true,
};

export interface ToolDefinition {
  name: string; description: string; inputSchema: JsonSchema; outputSchema: JsonSchema; annotations: Record<string, boolean>;
}

export function toolDefinitions(analysis: AnalysisData, includeBroken = false): ToolDefinition[] {
  assertAnalysis(analysis);
  const caps = activeCapabilities(analysis, includeBroken);
  const contract = analysis.toolContract;
  if (contract?.mode === "channel") {
    if (!caps.length) throw new Error("No selected capabilities for channel");
    const branches: JsonSchema[] = caps.map(c => ({...objectSchema(publicParams(analysis, c, true)), description: c.description + utteranceSuffix(c)}));
    // MCP requires an object root. oneOf enforces action-specific names, types and required fields.
    const properties: Record<string, unknown> = {};
    const choices: Record<string, JsonSchema[]> = {};
    for (const branch of branches) for (const [name,schema] of Object.entries(branch.properties as Record<string,JsonSchema>)) {
      (choices[name] ??= []).push(schema);
    }
    for (const [name,schemas] of Object.entries(choices)) {
      const unique = [...new Map(schemas.map(s=>[JSON.stringify(s),s])).values()];
      properties[name] = unique.length === 1 ? unique[0] : {anyOf:unique};
    }
    properties[contract.actionField ?? "action"] = { type: "string", enum: caps.map(c => c.publicAction ?? c.id) };
    return [{ name: contract.name!, description: (contract.description ?? caps.map(c => `${c.publicAction ?? c.id}: ${c.description}`).join("\n")) + contractDescriptionSuffix(analysis),
      inputSchema: { type: "object", properties, required: [contract.actionField ?? "action"], oneOf: branches, additionalProperties: false },
      outputSchema, annotations: annotationsForSafety(caps.every(c => c.safetyLevel === "readonly") ? "readonly" : caps.some(c => /confirm/.test(c.safetyLevel)) ? "confirm" : "normal") }];
  }
  const suffix = contractDescriptionSuffix(analysis);
  const tools: ToolDefinition[] = caps.map(c => ({ name: c.id, description: c.description + utteranceSuffix(c) + suffix, inputSchema: objectSchema(publicParams(analysis, c)), outputSchema, annotations: annotationsForSafety(c.safetyLevel) }));
  for (const builtin of MEDIA_BUILTINS.filter(b => analysis.builtins?.includes(b.name))) {
    tools.push({
      name: builtin.name,
      description: builtin.description,
      inputSchema: objectSchema(publicParams(analysis, {id:builtin.name,domain:'media',object:'session',action:builtin.name,description:builtin.description,params:[],safetyLevel:'normal',status:'probe',sourceRef:'builtin'})),
      outputSchema,
      annotations: annotationsForSafety("normal"),
    });
  }
  return tools;
}

export function openAIToolArtifact(analysis: AnalysisData, includeBroken = false): readonly Record<string, unknown>[] {
  const mcp = mcpToolArtifact(analysis, includeBroken).tools as Array<Record<string, unknown>>;
  return mcp.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

export function anthropicToolArtifact(analysis: AnalysisData, includeBroken = false): readonly Record<string, unknown>[] {
  const mcp = mcpToolArtifact(analysis, includeBroken).tools as Array<Record<string, unknown>>;
  return mcp.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

export function schemaArtifact(analysis: AnalysisData, format: SchemaFormat, includeBroken = false): unknown {
  if (format === "bridge") return bridgeFunctionArtifact(analysis, includeBroken);
  if (format === "mcp") return mcpToolArtifact(analysis, includeBroken);
  if (format === "openai") return openAIToolArtifact(analysis, includeBroken);
  if (format === "anthropic") return anthropicToolArtifact(analysis, includeBroken);
  return {
    schemaVersion: "bridge.schema-bundle/v1",
    app: analysis.app,
    bridge: bridgeFunctionArtifact(analysis, includeBroken),
    mcp: mcpToolArtifact(analysis, includeBroken),
    openai: openAIToolArtifact(analysis, includeBroken),
    anthropic: anthropicToolArtifact(analysis, includeBroken),
  };
}

/** Human-facing contract table columns, mirroring the integration contract sheet (功能名/参数名/类型/是否必填/取值/范围/说明). */
const csvTypeName = (field: FieldShape): string => {
  const t = normalizedJsonType(field.type);
  if (t === "array") {
    const item = arrayItemShape(field);
    return `List[${item ? csvTypeName(item) : "Any"}]`;
  }
  return { integer: "Int", number: "Float", string: "String", boolean: "Bool", object: "Object" }[t] ?? "String";
};

const csvRange = (field: FieldShape): string => {
  const parts: string[] = [];
  const enumValues = normalizedEnum(field);
  if (enumValues?.length) parts.push(enumValues.join("|"));
  const t = normalizedJsonType(field.type);
  if (t === "integer" || t === "number") {
    if (field.minimum !== undefined && field.maximum !== undefined) parts.push(`${field.minimum}~${field.maximum}`);
    else if (field.minimum !== undefined) parts.push(`≥${field.minimum}`);
    else if (field.maximum !== undefined) parts.push(`≤${field.maximum}`);
  }
  for (const [lo, hi] of [["minLength", "maxLength"], ["minItems", "maxItems"]] as const) {
    if (field[lo] !== undefined || field[hi] !== undefined) parts.push(`${lo === "minLength" ? "长度" : "项数"} ${field[lo] ?? 0}~${field[hi] ?? "∞"}`);
  }
  if (field.pattern) parts.push(`pattern:${field.pattern}`);
  return parts.join("；");
};

const csvCell = (value: unknown): string => {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRow = (cells: readonly unknown[]): string => cells.map(csvCell).join(",");

/** Picks a concrete example value for JSON call examples: examples → enum → bounds → type default. */
function exampleValue(p: ParamDef): unknown {
  if (p.examples?.length) return p.examples[0];
  const enumValues = normalizedEnum(p);
  if (enumValues?.length) return enumValues[0];
  const t = normalizedJsonType(p.type);
  if (t === "integer" || t === "number") return p.minimum ?? 0;
  if (t === "boolean") return true;
  if (t === "array") {
    const item = arrayItemShape(p);
    return item ? [exampleValue({ ...item, name: p.name })] : [];
  }
  if (t === "object") {
    const obj: Record<string, unknown> = {};
    for (const prop of p.properties ?? []) obj[prop.name] = exampleValue(prop);
    return obj;
  }
  return "xxx";
}

/** Renders the integration-doc "mcp协议" section: one row per capability with call/result JSON examples. */
export function mcpProtocolRows(analysis: AnalysisData, caps: readonly CapabilityDef[]): string[][] {
  const contract = analysis.toolContract;
  const channel = contract?.mode === "channel";
  const actionField = contract?.actionField ?? "action";
  const contextField = contract?.contextField ?? "extras";
  const context = contract?.context ?? [];
  const extras: Record<string, unknown> = {};
  for (const f of context) extras[f.name] = exampleValue(f);
  const successCode = contract?.response?.successCodes?.[0] ?? 0;
  const firstError = contract?.response?.errorCodes?.[0];

  return caps.map((c) => {
    const args: Record<string, unknown> = {};
    if (channel) args[actionField] = c.publicAction ?? c.id;
    for (const p of c.params ?? []) args[p.name] = exampleValue(p);
    if (context.length) args[contextField] = extras;
    const call = JSON.stringify({ name: channel ? contract?.name ?? "" : c.id, arguments: args }, null, 2);
    const ok = JSON.stringify({ code: successCode, message: "success", data: {}, extras: {} }, null, 2);
    const result = firstError
      ? `成功：\n${ok}\n失败：\n${JSON.stringify({ code: firstError.code, message: firstError.message, data: {}, extras: {} }, null, 2)}`
      : `成功：\n${ok}`;
    return [c.publicAction ?? c.id, call, result, ""];
  });
}

/**
 * Exports the human-facing contract sheet (integration-doc style): header info, function
 * overview, per-parameter detail table, and the error-code table. `presumed` entries
 * (pre-filled from PRD without code confirmation) are flagged 待确认 in 备注.
 */
export function contractTableCsv(analysis: AnalysisData, includeBroken = false): string {
  const rows: string[] = [];
  const contract = analysis.toolContract;
  const caps = activeCapabilities(analysis, includeBroken);
  const statusNote = (c: CapabilityDef) => {
    const base = c.status === "broken" ? "PRD-only 待实现" : c.status === "probe" ? "待运行验证" : "已验证";
    const presumed = c.presumed ? "；预填·待确认" : "";
    return `${base}${c.deliverNote ? `；${c.deliverNote}` : ""}${presumed}`;
  };

  rows.push("契约头信息");
  rows.push(csvRow(["channel", "契约版本", "超时声明", "client 应用包名"]));
  rows.push(csvRow([contract?.name ?? "", contract?.version ?? "", contract?.timeoutMs ? `${contract.timeoutMs}ms` : "", contract?.clientPackage ?? ""]));
  rows.push("");
  rows.push("功能总览");
  rows.push(csvRow(["功能名", "功能说明", "用户话术示例", "备注"]));
  for (const c of caps) rows.push(csvRow([c.publicAction ?? c.id, c.description, (c.utterances ?? []).join("；"), statusNote(c)]));
  rows.push("");
  rows.push("功能详情");
  rows.push(csvRow(["功能名", "参数名", "类型", "是否必填", "取值/范围", "说明", "示例", "备注"]));
  for (const c of caps) {
    const presumedNote = c.presumed ? "预填·待确认" : "";
    if (!c.params?.length) {
      rows.push(csvRow([c.publicAction ?? c.id, "", "", "", "", "", "", presumedNote]));
      continue;
    }
    for (const p of c.params) {
      rows.push(csvRow([
        c.publicAction ?? c.id,
        p.name,
        csvTypeName(p),
        !p.optional && p.defaultValue === undefined ? "是" : "否",
        csvRange(p),
        p.description ?? "",
        (p.examples ?? []).map((e) => JSON.stringify(e)).join("；"),
        p.presumed ? presumedNote || "预填·待确认" : presumedNote,
      ]));
    }
  }
  rows.push("");
  rows.push("mcp协议");
  rows.push(csvRow(["功能名", "mcp入参", "mcp返回结果", "0=成功，非0见错误码表"]));
  for (const cells of mcpProtocolRows(analysis, caps)) rows.push(csvRow(cells));
  rows.push("");
  rows.push("错误码表");
  rows.push(csvRow(["code", "说明"]));
  for (const code of contract?.response?.successCodes ?? [0]) rows.push(csvRow([code, "成功"]));
  for (const e of contract?.response?.errorCodes ?? []) rows.push(csvRow([e.code, e.description ? `${e.message}（${e.description}）` : e.message]));
  return "\uFEFF" + rows.join("\r\n") + "\r\n";
}

interface SchemaOptions {
  readonly analysisPath: string;
  readonly outputPath?: string;
  readonly format: SchemaFormat;
  readonly includeBroken: boolean;
  readonly compact: boolean;
}

function parseSchemaArgs(argv: string[]): SchemaOptions {
  let analysisPath = "";
  let outputPath: string | undefined;
  let format: SchemaFormat = "bridge";
  let includeBroken = false;
  let compact = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--analysis") analysisPath = next() ?? "";
    else if (arg === "--out") outputPath = next();
    else if (arg === "--format") format = (next() ?? "") as SchemaFormat;
    else if (arg === "--include-broken") includeBroken = true;
    else if (arg === "--compact") compact = true;
    else throw new Error(`Unknown schema option: ${arg}`);
  }
  if (!analysisPath) throw new Error("schema requires --analysis <analysis.json>");
  if (!["bridge", "mcp", "openai", "anthropic", "contract", "all"].includes(format)) {
    throw new Error(`Unsupported schema format: ${format}`);
  }
  return { analysisPath, outputPath, format, includeBroken, compact };
}

export async function schemaCommand(argv: string[]): Promise<void> {
  const opts = parseSchemaArgs(argv);
  const analysis = JSON.parse(readFileSync(opts.analysisPath, "utf-8")) as AnalysisData;
  if (opts.format === "contract") {
    const csv = contractTableCsv(analysis, opts.includeBroken);
    if (!opts.outputPath) {
      process.stdout.write(csv);
      return;
    }
    mkdirSync(dirname(opts.outputPath), { recursive: true });
    writeFileSync(opts.outputPath, csv, "utf-8");
    process.stdout.write(`contract table written: ${activeCapabilities(analysis, opts.includeBroken).length} capabilities -> ${opts.outputPath}\n`);
    return;
  }
  const artifact = schemaArtifact(analysis, opts.format, opts.includeBroken);
  const json = JSON.stringify(artifact, null, opts.compact ? undefined : 2) + "\n";
  if (!opts.outputPath) {
    process.stdout.write(json);
    return;
  }
  mkdirSync(dirname(opts.outputPath), { recursive: true });
  writeFileSync(opts.outputPath, json, "utf-8");
  const count = (mcpToolArtifact(analysis, opts.includeBroken).tools as unknown[]).length;
  process.stdout.write(`function schema written: ${count} tools (${opts.format}) -> ${opts.outputPath}\n`);
}
