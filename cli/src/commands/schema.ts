import { dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { AnalysisData, CapabilityDef, FieldShape, ParamDef } from "../types.js";

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
    const values = field.enum.map((value) => value.toLowerCase() === "true" ? true : value.toLowerCase() === "false" ? false : value);
    return values;
  }
  return [...field.enum];
}

function objectSchema(properties: readonly ParamDef[] = [], explicitRequired?: readonly string[]): JsonSchema {
  const mapped: Record<string, JsonSchema> = {};
  for (const property of properties) mapped[property.name] = jsonSchemaForField(property);
  const required = explicitRequired?.length
    ? [...explicitRequired]
    : properties.filter((property) => !property.optional).map((property) => property.name);
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
  } else {
    schema = { type };
    const enumValues = normalizedEnum(field);
    if (enumValues?.length) schema.enum = [...enumValues];
    if ((type === "integer" || type === "number") && field.minimum !== undefined) schema.minimum = field.minimum;
    if ((type === "integer" || type === "number") && field.maximum !== undefined) schema.maximum = field.maximum;
  }
  if (field.description) schema.description = field.description;
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

function activeCapabilities(analysis: AnalysisData, includeBroken: boolean): readonly CapabilityDef[] {
  return (analysis.capabilities ?? []).filter((capability) => includeBroken || capability.status !== "broken");
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
    required: !param.optional,
  };
  const options = normalizedJsonType(param.type) === "array"
    ? normalizedEnum(arrayItemShape(param) ?? param)
    : normalizedEnum(param);
  if (options?.length) result.options = [...options];
  if (param.description) result.description = param.description;
  if (param.defaultValue !== undefined) result.default = param.defaultValue;
  if (param.examples?.length) result.examples = [...param.examples];
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
  const functions: BridgeFunctionSchema[] = activeCapabilities(analysis, includeBroken).map(bridgeFunctionFor);
  for (const builtin of MEDIA_BUILTINS) functions.push({ name: builtin.name, arguments: {}, description: builtin.description });
  return {
    schemaVersion: "bridge.function-schema/v1",
    app: analysis.app,
    functions,
  };
}

export function mcpToolArtifact(analysis: AnalysisData, includeBroken = false): Record<string, unknown> {
  const tools = activeCapabilities(analysis, includeBroken).map((capability) => ({
    name: capability.id,
    description: capability.description,
    inputSchema: jsonSchemaFor(capability),
    annotations: annotationsForSafety(capability.safetyLevel),
  }));
  for (const builtin of MEDIA_BUILTINS) {
    tools.push({
      name: builtin.name,
      description: builtin.description,
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: annotationsForSafety("normal"),
    });
  }
  return { tools };
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
