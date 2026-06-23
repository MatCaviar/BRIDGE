import type { AnalysisData } from "../types.js";

export function generateEnums(analysis: AnalysisData): string {
  const enums = analysis.enums;
  if (!enums || Object.keys(enums).length === 0) {
    return "// No enums defined\n";
  }

  const blocks: string[] = [];

  for (const [name, def] of Object.entries(enums)) {
    const entries = def.values.map((v, i) => {
      if (def.type === "string") {
        return `  ${v}: "${v}"`;
      }
      // For number enums, check if value looks like a number
      if (/^\d+$/.test(v)) {
        return `  ${v}: ${v}`;
      }
      // Value is a name, assign sequential number starting from 0
      return `  ${v}: ${i}`;
    }).join(",\n");

    const comment = def.sourceFile ? `// Source: ${def.sourceFile}\n` : "";
    blocks.push(`${comment}export const ${name} = {\n${entries}\n} as const;\nexport type ${name} = (typeof ${name})[keyof typeof ${name}];`);
  }

  return blocks.join("\n\n") + "\n";
}
