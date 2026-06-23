import type { AnalysisData, ParamDef, ReturnsDef, TypedField } from "../types.js";

const TS_KEYWORDS = new Set(["class", "function", "return", "const", "let", "var", "new", "delete", "typeof", "instanceof", "void", "in", "of", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "try", "catch", "finally", "throw", "import", "export", "from", "default", "extends", "implements", "interface", "type", "enum", "async", "await", "yield", "this", "super", "static", "get", "set", "readonly", "private", "protected", "public", "abstract", "declare", "namespace", "module", "require"]);

function sanitizePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, "");
}

function pascal(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toMethodName(action: string, objectName: string): string {
  const words = action.split("_").map(sanitizePart).filter(Boolean);
  const verb = words[0].toLowerCase();
  const objectParts = objectName.split("_").map(sanitizePart).filter(Boolean).map(pascal);
  const rest = words.slice(1).map(pascal);
  const prepositions = new Set(["To", "From", "By", "With", "For", "Into", "Onto", "At"]);
  const before = rest.filter((w) => prepositions.has(w));
  const after = rest.filter((w) => !prepositions.has(w));
  return verb + [...before, ...objectParts, ...after].join("");
}

function toDtoName(capId: string): string {
  return capId.split("_").map(s => sanitizePart(s)).filter(Boolean).map(pascal).join("") + "Result";
}

function tsType(type: string): string {
  if (type === "string") return "string";
  if (type === "number") return "number";
  if (type === "boolean") return "boolean";
  if (!type) return "unknown";
  return type;
}

function safeFieldName(name: string): string {
  if (!name) return "_empty";
  if (TS_KEYWORDS.has(name)) return `_${name}`;
  return name;
}

function inferFieldType(name: string): string {
  const lower = name.toLowerCase();
  // Specific exceptions — must precede general regex patterns
  if (lower === "success") return "boolean";
  if (lower === "gearvalue" || lower === "gear") return "string";
  if (lower === "status") return "string";
  if (lower === "ignoremode" || lower === "ignores") return "string";

  // Boolean patterns - prefix patterns only
  if (/^(is|has|can|should)/.test(lower)) return "boolean";
  // Suffix patterns - but exclude "mode" which is often string
  if (/(enabled|active|visible|available|loading|playing|paused)$/i.test(name)) return "boolean";

  // Number patterns
  if (/^(fade|balance|level|volume|x|y|z|count|depth|size|length|value|fps|number|total|index|width|height|duration|code|port)$/i.test(lower)) return "number";
  if (/(count|depth|size|length|value|fps|number|total|index|width|height|duration|code|port|percent|ratio|score|weight)$/i.test(name)) return "number";

  // String patterns - URLs, paths, names
  if (/(url|uri|href|path|link|src|source)$/i.test(name)) return "string";
  if (/(name|label|text|message|msg|title|display|description|ssid|vin|page|scene|style|type|id|code|preset|resource|mode|gear|status|position|state)$/i.test(name)) return "string";

  return "string";
}

export function buildMethodMap(analysis: AnalysisData): Map<string, string> {
  const counts = new Map<string, number>();
  const result = new Map<string, string>();
  for (const cap of analysis.capabilities) {
    const base = toMethodName(cap.action, cap.object);
    const idx = counts.get(base) ?? 0;
    counts.set(base, idx + 1);
    result.set(cap.id, idx === 0 ? base : `${base}${idx + 1}`);
  }
  return result;
}

export function generateAdapterTypes(analysis: AnalysisData): string {
  const lines: string[] = [];
  lines.push("// Auto-generated adapter interface — derived from analysis.json capabilities");
  lines.push("// IAdapter is the contract between tool handlers and platform SDKs");
  lines.push("");

  const methodMap = buildMethodMap(analysis);

  // Generate result DTOs
  for (const cap of analysis.capabilities) {
    if (!cap.returns) continue;
    const dtoName = toDtoName(cap.id);
    const fields = (cap.returns.fields ?? []).filter((f) => {
      const name = typeof f === "string" ? f : f.name;
      return name && name !== "success";
    });
    lines.push(`export interface ${dtoName} {`);
    lines.push("  readonly success: boolean;");
    for (const f of fields) {
      if (typeof f === "string") {
        lines.push(`  readonly ${safeFieldName(f)}: ${inferFieldType(f)};`);
      } else {
        const typed = f as TypedField;
        lines.push(`  readonly ${safeFieldName(typed.name)}: ${tsType(typed.type)};`);
      }
    }
    lines.push("}");
    lines.push("");
  }

  // Generate IAdapter interface
  lines.push("export interface IAdapter {");
  lines.push("  readonly isMock: boolean;");
  lines.push("");

  for (const cap of analysis.capabilities) {
    const retType = cap.returns ? toDtoName(cap.id) : "unknown";
    const params = (cap.params ?? []).map((p) => `${safeFieldName(p.name)}${p.optional ? "?" : ""}: ${tsType(p.type)}`);
    const methodName = methodMap.get(cap.id)!;
    lines.push(`  ${methodName}(${params.join(", ")}): Promise<${retType}>;`);
  }

  lines.push("}");
  lines.push("");

  return lines.join("\n") + "\n";
}

export { toMethodName, tsType, toDtoName, inferFieldType, safeFieldName };
