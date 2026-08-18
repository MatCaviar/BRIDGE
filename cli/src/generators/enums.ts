import type { AnalysisData } from "../types.js";
import { assertIdent, escapeComment } from "../utils/sanitize.js";

export function generateEnums(analysis: AnalysisData): string {
  const enums = analysis.enums;
  if (!enums || Object.keys(enums).length === 0) {
    return "// No enums defined\n";
  }

  const blocks: string[] = [];

  for (const [name, def] of Object.entries(enums)) {
    const ident = assertIdent(name, `enum "${name}"`);
    const entries = def.values.map((v, i) => {
      const key = JSON.stringify(v); // safe quoted object-literal key (handles any chars)
      if (def.type === "string") {
        return `  ${key}: ${JSON.stringify(v)}`;
      }
      // For number enums, check if value looks like a number
      if (/^\d+$/.test(v)) {
        return `  ${key}: ${v}`;
      }
      // Value is a name, assign sequential number starting from 0
      return `  ${key}: ${i}`;
    }).join(",\n");

    const comment = def.sourceFile ? `// Source: ${escapeComment(def.sourceFile)}\n` : "";
    const mapExport = def.map ? `\n// wireValue → name\nexport const ${ident}Map: Record<string, string> = ${JSON.stringify(def.map)};` : "";
    blocks.push(`${comment}export const ${ident} = {\n${entries}\n} as const;\nexport type ${ident} = (typeof ${ident})[keyof typeof ${ident}];${mapExport}`);
  }

  return blocks.join("\n\n") + "\n";
}
