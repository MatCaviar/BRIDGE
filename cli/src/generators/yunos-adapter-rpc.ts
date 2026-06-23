import type { AnalysisData } from "../types.js";
import { buildMethodMap, tsType, safeFieldName, toDtoName } from "./adapter-types.js";

/** 生成按名映射 DTO 的对象字面量（returns.fields → data[f] ?? default）。
 *  每个生成的 DTO 接口都无条件要求 success: boolean（见 adapter-types.ts），
 *  因此这里始终注入 success: true，确保对象字面量满足接口契约（spec §4.1/§9.2）。 */
function mapDtoSnippet(fields: readonly string[]): string {
  const extra = fields.filter((f) => f !== "success").map((f) =>
    `${f}: (data as any)[${JSON.stringify(f)}] ?? defaultFor(${JSON.stringify(f)})`,
  ).join(", ");
  return extra ? `{ success: true, ${extra} }` : "{ success: true }";
}

export function generateYunosAdapterRpc(analysis: AnalysisData): string {
  const dtoNames = analysis.capabilities.filter((c) => c.returns).map((c) => toDtoName(c.id));
  const lines: string[] = [];
  lines.push('import { rpcCall as defaultRpcCall } from "../rpc/rpc-client.js";');
  lines.push("import type { AdbConfig } from \"../config.js\";");
  lines.push('import type { IAdapter' + (dtoNames.length ? ", " + dtoNames.join(", ") : "") + ' } from "./types.js";');
  lines.push("");
  lines.push("function defaultFor(field: string): unknown {");
  lines.push("  if (/enabled|active|playing/i.test(field)) return false;");
  lines.push("  return \"\";");
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
    lines.push("");
    lines.push(`    async ${methodName}(${params}): Promise<${retType}> {`);
    lines.push(`      const data = await rpcFn(${JSON.stringify(cap.id)}, ${argsObj}, adbConfig);`);
    lines.push(`      return ${mapDtoSnippet(fields)} as unknown as ${retType};`);
    lines.push("    },");
  }
  lines.push("  };");
  lines.push("}");
  lines.push("");
  return lines.join("\n");
}
