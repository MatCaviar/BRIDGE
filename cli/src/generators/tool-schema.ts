import type { AnalysisData, ParamDef, ReturnsDef, FieldShape } from "../types.js";

/** Static tool definition — the deterministic projection of a capability into an MCP tool.
 *  Deliberately does NOT include `executable`: that is derived at runtime / preview time from
 *  rpc/config.json `_deferred` (always current). Hardcoding it into the static schema would lag
 *  whenever _deferred changes after scaffold. */
export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly outputSchema?: Readonly<Record<string, unknown>>;
  readonly annotations: Readonly<Record<string, boolean>>;
}

/** A ToolDef plus its derived executability (true unless the op is in rpc/config.json `_deferred`). */
export interface ToolDefWithExecutability extends ToolDef {
  readonly executable: boolean;
}

function safetyToAnnotations(level: string): Record<string, boolean> {
  switch (level) {
    case "readonly": return { readOnlyHint: true, idempotentHint: true };
    case "p_gear_required":
    case "p_gear_and_confirm": return { destructiveHint: true };
    case "p_gear_and_network": return { destructiveHint: true, openWorldHint: true };
    default: return {};
  }
}

type JsonSchema = Record<string, unknown>;

/** Strip a trailing `[]` or `Array<...>` wrapper → {array, elem}, so `string[]`/`T[]`/`Array<T>`
 *  project to {type:"array", items:{...}}. */
function stripArray(type: string): { array: boolean; elem: string } {
  const t = type.trim();
  if (t.endsWith("[]")) return { array: true, elem: t.slice(0, -2).trim() };
  const m = t.match(/^Array<(.+)>$/);
  if (m) return { array: true, elem: m[1].trim() };
  return { array: false, elem: t };
}

/** Structural subset that ParamDef / TypedField / FieldShape all satisfy — lets one recursive
 *  projector (fieldToSchema) serve params, return fields, and nested sub-shapes. */
interface Shape {
  readonly type: string;
  readonly enum?: readonly string[];
  readonly description?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly items?: FieldShape;
  readonly properties?: readonly ParamDef[];
  readonly required?: readonly string[];
}

/** enum values → typed JSON-Schema enum (number/boolean stay typed; else string). Values are the real
 *  wire values authored in /mcp-analyze — projected verbatim. */
function enumSchema(elem: string, values: readonly string[], errName: string): JsonSchema {
  if (elem === "number") {
    return { type: "number", enum: values.map((v) => { const n = Number(v); if (!Number.isFinite(n)) throw new Error(`number enum for '${errName}' contains non-numeric value '${v}'`); return n; }) };
  }
  if (elem === "boolean") {
    return { type: "boolean", enum: values.map((v) => { if (v !== "true" && v !== "false") throw new Error(`boolean enum for '${errName}' contains non-boolean value '${v}'`); return v === "true"; }) };
  }
  return { type: "string", enum: [...values] };
}

/** Recursive shape → JSON-Schema: `properties` (named ParamDef[]) → object, `items` (nameless
 *  FieldShape) → array element, both nesting recursively; enum/scalar otherwise. A type with neither
 *  properties nor items falls back to an opaque object (backward-compat). */
function fieldToSchema(s: Shape): JsonSchema {
  const { array, elem } = stripArray(s.type);
  let elemSchema: JsonSchema;
  if (s.enum && s.enum.length > 0) {
    elemSchema = enumSchema(elem, s.enum, s.description ?? s.type);
  } else if (elem === "string" || elem === "boolean") {
    elemSchema = { type: elem };
  } else if (elem === "number" || elem === "float" || elem === "double") {
    elemSchema = { type: "number" };
  } else if (elem === "integer" || elem === "int" || elem === "long") {
    elemSchema = { type: "integer" };
  } else if (s.properties && s.properties.length > 0) {
    const props: JsonSchema = {};
    for (const sub of s.properties) props[sub.name] = fieldToSchema(sub);
    elemSchema = { type: "object", properties: props, additionalProperties: false };
    const req = s.required ? [...s.required] : s.properties.filter((p) => !p.optional).map((p) => p.name);
    if (req.length > 0) elemSchema.required = req;
  } else {
    elemSchema = { type: "object", additionalProperties: true };
  }
  if (array) {
    const arr: JsonSchema = { type: "array", items: s.items ? fieldToSchema(s.items) : elemSchema };
    if (s.description) arr.description = s.description;
    return arr;
  }
  if (s.minimum !== undefined && (elemSchema.type === "number" || elemSchema.type === "integer")) elemSchema.minimum = s.minimum;
  if (s.maximum !== undefined && (elemSchema.type === "number" || elemSchema.type === "integer")) elemSchema.maximum = s.maximum;
  if (s.description) elemSchema.description = s.description;
  return elemSchema;
}

/** param → JSON-Schema. Delegates to fieldToSchema (type/enum/properties/items/bounds/description),
 *  then layers param-level `examples`/`default`. */
function paramToJsonSchema(p: ParamDef): JsonSchema {
  const s = fieldToSchema(p);
  if (p.defaultValue !== undefined) s.default = p.defaultValue;
  if (p.examples && p.examples.length > 0) s.examples = [...p.examples];
  return s;
}

/** returns → MCP outputSchema, so a downstream agent can chain tools (e.g. read resourceCode from
 *  query_sound_library, feed it to install_sound_library). TypedField fields → typed properties;
 *  bare-string fields → untyped properties; an array-suffix on returns.type wraps in {type:"array",items}. */
function returnsToJsonSchema(returns: ReturnsDef | undefined): JsonSchema | undefined {
  if (!returns) return undefined;
  const { array } = stripArray(returns.type);
  const fields = returns.fields ?? [];
  // MCP mandates outputSchema.type === "object" (structuredContent is always an object). Structured
  // returns (named fields, non-array) project to typed properties — enables tool chaining (e.g. read
  // resourceCode from query_sound_library, feed it to install_sound_library). Scalar / array /
  // unstructured returns get a permissive object: the server emits content (not structuredContent),
  // so outputSchema is a declarative hint, not a validated wire contract.
  if (!array && fields.length > 0) {
    const properties: JsonSchema = {};
    for (const f of fields) {
      if (typeof f === "string") properties[f] = {}; // bare name — type unknown
      else properties[f.name] = fieldToSchema(f);    // TypedField → items/properties/enum project (enables chaining)
    }
    return { type: "object", properties };
  }
  return { type: "object", additionalProperties: true };
}

function capabilityInputSchema(cap: { readonly params?: readonly ParamDef[]; readonly safetyLevel?: string }): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const p of cap.params ?? []) {
    properties[p.name] = paramToJsonSchema(p);
    if (!p.optional) required.push(p.name);
  }
  if (cap.safetyLevel === "p_gear_and_confirm") {
    if (!Object.prototype.hasOwnProperty.call(properties, "confirmed")) {
      properties.confirmed = {
        type: "boolean",
        description: "Must be true to confirm this operation.",
      };
    }
    if (!required.includes("confirmed")) required.push("confirmed");
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

function assertUniqueToolSurface(analysis: AnalysisData): void {
  const toolNames = new Set<string>();
  for (const cap of analysis.capabilities) {
    if (toolNames.has(cap.id)) {
      throw new Error(`duplicate capability id '${cap.id}' would collide as an MCP tool name`);
    }
    toolNames.add(cap.id);

    const paramNames = new Set<string>();
    for (const param of cap.params ?? []) {
      if (paramNames.has(param.name)) {
        throw new Error(`duplicate parameter name '${param.name}' in capability '${cap.id}'`);
      }
      paramNames.add(param.name);
    }
  }
}

/** Pure transform: analysis → static MCP tool definitions (the upstream agent's tool surface).
 *  SINGLE SOURCE OF TRUTH — shared by scaffold (emits src/tools/schema.ts) and schema_preview
 *  (writes tools-schema.json directly, no server introspection, no build dependency). */
export function buildToolDefs(analysis: AnalysisData): readonly ToolDef[] {
  assertUniqueToolSurface(analysis);
  return analysis.capabilities.map((cap) => ({
    name: cap.id,
    description: cap.description ?? `${cap.action.replace(/_/g, " ")} ${cap.object.replace(/_/g, " ")}`,
    inputSchema: capabilityInputSchema(cap),
    outputSchema: returnsToJsonSchema(cap.returns),
    annotations: safetyToAnnotations(cap.safetyLevel),
  }));
}

/** Attach `executable` (derived from rpc/config.json `_deferred`) to each tool. Used by schema_preview
 *  and the server runtime so executability is always read from the CURRENT config — never lagging. */
export function withExecutability(tools: readonly ToolDef[], deferred: readonly string[]): readonly ToolDefWithExecutability[] {
  const set = new Set(deferred);
  return tools.map((t) => ({ ...t, executable: !set.has(t.name) }));
}

/** Emit src/tools/schema.ts — the runtime single-source tool surface. server.ts tools/list returns
 *  TOOL_SCHEMA verbatim and derives `executable` from rpc/config.json at request time. */
export function generateToolSchema(analysis: AnalysisData): string {
  const tools = buildToolDefs(analysis);
  return [
    "// Auto-generated tool schema — do not edit manually.",
    "// Derived from analysis.json capabilities.",
    "// SINGLE SOURCE OF TRUTH: server tools/list returns TOOL_SCHEMA verbatim and derives `executable`",
    "// from rpc/config.json _deferred at request time (so it never lags when _deferred changes).",
    "",
    "export interface ToolDef {",
    "  readonly name: string;",
    "  readonly description: string;",
    "  readonly inputSchema: Readonly<Record<string, unknown>>;",
    "  readonly outputSchema?: Readonly<Record<string, unknown>>;",
    "  readonly annotations: Readonly<Record<string, boolean>>;",
    "}",
    "",
    `export const TOOL_SCHEMA: readonly ToolDef[] = ${JSON.stringify(tools, null, 2)} as const;`,
    "",
    "export const TOOL_COUNT = TOOL_SCHEMA.length;",
    "",
  ].join("\n");
}
