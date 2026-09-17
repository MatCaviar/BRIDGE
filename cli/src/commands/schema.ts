import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AnalysisData, CapabilityDef, FieldShape, ParamDef } from "../types.js";
import { assertAnalysis } from "../../../contract/analysis.mjs";

export type SchemaFormat = "bridge" | "mcp" | "openai" | "anthropic" | "all";
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
  if (!["bridge", "mcp", "openai", "anthropic", "all"].includes(format)) {
    throw new Error(`Unsupported schema format: ${format}`);
  }
  return { analysisPath, outputPath, format, includeBroken, compact };
}

export async function schemaCommand(argv: string[]): Promise<void> {
  const opts = parseSchemaArgs(argv);
  const analysis = JSON.parse(readFileSync(opts.analysisPath, "utf-8")) as AnalysisData;
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
