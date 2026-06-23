import type { AnalysisData } from "../types.js";

export function generateRegistry(analysis: AnalysisData): string {
  const lines: string[] = [];
  lines.push("// Auto-generated tool registry — do not edit manually");
  lines.push("// Derived from analysis.json capabilities");
  lines.push("");
  lines.push("export type SafetyLevel =");
  lines.push("  | \"readonly\"");
  lines.push("  | \"normal\"");
  lines.push("  | \"p_gear_required\"");
  lines.push("  | \"p_gear_and_confirm\"");
  lines.push("  | \"p_gear_and_network\";");
  lines.push("");

  lines.push("export interface ToolAnnotations {");
  lines.push("  readonly readOnlyHint?: boolean;");
  lines.push("  readonly destructiveHint?: boolean;");
  lines.push("  readonly idempotentHint?: boolean;");
  lines.push("  readonly openWorldHint?: boolean;");
  lines.push("}");
  lines.push("");

  lines.push("export interface ToolRegistryEntry {");
  lines.push("  readonly id: string;");
  lines.push("  readonly domain: string;");
  lines.push("  readonly object: string;");
  lines.push("  readonly action: string;");
  lines.push("  readonly safetyLevel: SafetyLevel;");
  lines.push("  readonly sdkCalls: readonly string[];");
  lines.push("  readonly sourceRef: string;");
  lines.push("}");
  lines.push("");

  lines.push("export function safetyToAnnotations(level: SafetyLevel): ToolAnnotations {");
  lines.push("  switch (level) {");
  lines.push("    case \"readonly\": return { readOnlyHint: true, idempotentHint: true };");
  lines.push("    case \"normal\": return {};");
  lines.push("    case \"p_gear_required\": return { destructiveHint: true };");
  lines.push("    case \"p_gear_and_confirm\": return { destructiveHint: true };");
  lines.push("    case \"p_gear_and_network\": return { destructiveHint: true, openWorldHint: true };");
  lines.push("  }");
  lines.push("}");
  lines.push("");

  lines.push("export const TOOL_REGISTRY: readonly ToolRegistryEntry[] = [");

  for (const cap of analysis.capabilities) {
    lines.push("  {");
    lines.push(`    id: "${cap.id}",`);
    lines.push(`    domain: "${cap.domain}",`);
    lines.push(`    object: "${cap.object}",`);
    lines.push(`    action: "${cap.action}",`);
    lines.push(`    safetyLevel: "${cap.safetyLevel}",`);
    lines.push(`    sdkCalls: [${cap.sdkCalls.map((s) => `"${s}"`).join(", ")}],`);
    lines.push(`    sourceRef: "${cap.sourceRef}",`);
    lines.push("  },");
  }

  lines.push("];");

  const domains = [...new Set(analysis.capabilities.map((c) => c.domain))];
  lines.push("");
  lines.push("export const DOMAINS = [");
  for (const d of domains) {
    lines.push(`  "${d}",`);
  }
  lines.push("] as const;");
  lines.push("");

  lines.push("export const TOOL_COUNT = TOOL_REGISTRY.length;");
  lines.push("");

  lines.push("export function getToolMeta(id: string): ToolRegistryEntry | undefined {");
  lines.push("  return TOOL_REGISTRY.find(e => e.id === id);");
  lines.push("}");
  lines.push("");

  lines.push("export function getToolsByDomain(domain: string): readonly ToolRegistryEntry[] {");
  lines.push("  return TOOL_REGISTRY.filter(e => e.domain === domain);");
  lines.push("}");
  lines.push("");

  lines.push("export function getToolsByCategory(level: SafetyLevel): readonly ToolRegistryEntry[] {");
  lines.push("  return TOOL_REGISTRY.filter(e => e.safetyLevel === level);");
  lines.push("}");

  return lines.join("\n") + "\n";
}
