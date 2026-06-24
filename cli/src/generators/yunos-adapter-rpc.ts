import type { AnalysisData } from "../types.js";
import { buildMethodMap, tsType, safeFieldName, toDtoName, inferFieldType } from "./adapter-types.js";

/** DESIGN A (C2 fix): the reply descriptor drives how each rpcCall result is extracted into the DTO.
 *  The device returns varied shapes (PolicyResponse envelope, scalar, JSON-encoded string); the
 *  descriptor (from rpc/config.json) tells the adapter how to reach the payload. This helper is
 *  emitted verbatim into the generated adapter; the per-op call site threads the descriptor in. */
const REPLY_HELPER = `function normalizeReplyLocal(reply: unknown): { read: string; unwrap?: string; parseJson?: boolean; valueField?: string } {
  if (typeof reply === "string") return { read: reply };
  const r = (reply ?? {}) as Record<string, unknown>;
  const read = typeof r.read === "string" ? r.read : "json";
  const out: { read: string; unwrap?: string; parseJson?: boolean; valueField?: string } = { read };
  if (typeof r.unwrap === "string") out.unwrap = r.unwrap;
  if (typeof r.parseJson === "boolean") out.parseJson = r.parseJson;
  if (typeof r.valueField === "string") out.valueField = r.valueField;
  return out;
}
function getByPath(obj: unknown, path: string): unknown {
  let node: unknown = obj;
  for (const seg of path.split(".")) {
    if (node == null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[seg];
  }
  return node;
}
/** Apply the reply descriptor to a raw rpcCall result → the extracted payload. */
function applyReply(raw: unknown, reply: unknown): unknown {
  const d = normalizeReplyLocal(reply);
  let value = raw;
  if (d.unwrap) value = getByPath(value, d.unwrap);
  if (d.parseJson && typeof value === "string") { try { value = JSON.parse(value); } catch { /* keep string */ } }
  return value;
}
`;

/** Build the object literal that maps the extracted payload into the DTO fields.
 *  Each DTO field (except success) maps from payload[f] ?? <type-default>. success defaults to true. */
function mapDtoSnippet(fields: readonly string[]): string {
  const dft = (f: string): string => {
    switch (inferFieldType(f)) { case "boolean": return "false"; case "number": return "0"; default: return '""'; }
  };
  const extra = fields.filter((f) => f !== "success").map((f) =>
    `${f}: (payload as any)[${JSON.stringify(f)}] ?? ${dft(f)}`,
  ).join(", ");
  return extra ? `{ success: true, ${extra} }` : "{ success: true }";
}

/** For an op with valueField (scalar result → one DTO field): map the scalar onto that field.
 *  Set ops use read 'double'/'int' where 0 = success. Read ops with a single scalar map directly. */
function scalarSnippet(fields: readonly string[], valueField: string | undefined): string {
  const target = valueField ?? "success";
  if (target === "success") {
    // 0 = success for set ops (the device's double/int return convention)
    return "{ success: Number(extracted) === 0 }";
  }
  const dft = (() => { switch (inferFieldType(target)) { case "boolean": return "false"; case "number": return "0"; default: return '""'; } })();
  return `{ success: true, ${target}: (extracted as any) ?? ${dft} }`;
}

export function generateYunosAdapterRpc(analysis: AnalysisData): string {
  const dtoNames = analysis.capabilities.filter((c) => c.returns).map((c) => toDtoName(c.id));
  const lines: string[] = [];
  lines.push('import { rpcCall as defaultRpcCall } from "../rpc/rpc-client.js";');
  lines.push('import { constructDbusCall, type RpcConfig } from "../rpc/rpc-engine.js";');
  lines.push("import type { AdbConfig } from \"../config.js\";");
  lines.push('import type { IAdapter' + (dtoNames.length ? ", " + dtoNames.join(", ") : "") + ' } from "./types.js";');
  lines.push("");
  lines.push(REPLY_HELPER);
  lines.push("let cachedConfig: RpcConfig | null = null;");
  lines.push("async function loadConfig(): Promise<RpcConfig> {");
  lines.push("  if (cachedConfig) return cachedConfig;");
  lines.push("  const { readFileSync } = await import(\"node:fs\");");
  lines.push("  const { resolve, dirname } = await import(\"node:path\");");
  lines.push("  const { fileURLToPath } = await import(\"node:url\");");
  lines.push("  const here = dirname(fileURLToPath(import.meta.url));");
  lines.push("  cachedConfig = JSON.parse(readFileSync(resolve(here, \"..\", \"..\", \"rpc\", \"config.json\"), \"utf-8\")) as RpcConfig;");
  lines.push("  return cachedConfig;");
  lines.push("}");
  lines.push("");
  lines.push("export function createYunosAdapter(adbConfig: AdbConfig, rpcFn: (op: string, args: unknown, config: AdbConfig) => Promise<unknown> = defaultRpcCall): IAdapter {");
  lines.push("  return {");
  lines.push("    isMock: false,");
  const methodMap = buildMethodMap(analysis);
  for (const cap of analysis.capabilities) {
    const methodName = methodMap.get(cap.id)!;
    const params = (cap.params ?? []).map((p) => `${safeFieldName(p.name)}${p.optional ? "?" : ""}: ${tsType(p.type)}`).join(", ");
    const retType = cap.returns ? toDtoName(cap.id) : "unknown";
    const fields = (cap.returns?.fields ?? []).filter((f) => typeof f === "string") as string[];
    const argsObj = (cap.params ?? []).length ? `{ ${(cap.params ?? []).map((p) => safeFieldName(p.name)).join(", ")} }` : "{}";
    const hasValueField = fields.length <= 1; // scalar-shaped DTO → may use valueField extraction
    lines.push("");
    lines.push(`    async ${methodName}(${params}): Promise<${retType}> {`);
    lines.push(`      const cfg = await loadConfig();`);
    lines.push(`      const spec = cfg[${JSON.stringify(cap.id)}] as { reply?: unknown } | undefined;`);
    lines.push(`      const replyDesc = spec?.reply;`);
    lines.push(`      const rpcResult = await rpcFn(${JSON.stringify(cap.id)}, ${argsObj}, adbConfig);`);
    if (hasValueField) {
      // Scalar-shaped DTO: applyReply unwraps/parseJson, then map the scalar onto the single field.
      const vf = fields[0];
      lines.push(`      const extracted = applyReply(rpcResult, replyDesc);`);
      lines.push(`      return ${scalarSnippet(fields, vf)} as unknown as ${retType};`);
    } else {
      // Object-shaped DTO: unwrap/parseJson to the payload object, then map fields by name.
      lines.push(`      const payload = applyReply(rpcResult, replyDesc);`);
      lines.push(`      return ${mapDtoSnippet(fields)} as unknown as ${retType};`);
    }
    lines.push("    },");
  }
  lines.push("  };");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
