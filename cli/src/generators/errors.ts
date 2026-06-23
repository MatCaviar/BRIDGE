import type { AnalysisData } from "../types.js";

export function generateErrors(analysis: AnalysisData): string {
  const errorCodes = analysis.errorCodes;
  if (!errorCodes || Object.keys(errorCodes).length === 0) {
    return "// No error codes defined\n";
  }

  const lines: string[] = [];
  lines.push("// Auto-generated error codes — do not edit manually");
  lines.push("// Code format: prefix * 1000 + suffix (e.g. 2001 = navigation prefix 2 + suffix 1)");
  lines.push("");

  const errorEntries: string[] = [];

  for (const [key, domain] of Object.entries(errorCodes)) {
    const prefix = domain.prefix;
    const constName = key.toUpperCase();

    for (const [codeName, def] of Object.entries(domain.codes)) {
      const fullCode = prefix * 1000 + def.value;
      const fullName = `${constName}_${codeName}`;
      lines.push(`export const ${fullName} = ${fullCode} as const;`);
      errorEntries.push(`  [${fullName}]: { code: ${fullName}, message: "${def.message}" },`);
    }
  }

  lines.push("");
  lines.push("export const ERROR_MAP: Record<number, { code: number; message: string }> = {");
  for (const entry of errorEntries) {
    lines.push(entry);
  }
  lines.push("};");

  return lines.join("\n") + "\n";
}
