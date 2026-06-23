import type { AnalysisData } from "../types.js";

export function generateContractTests(analysis: AnalysisData): string {
  const lines: string[] = [];
  lines.push(`// Contract tests for ${analysis.app.name} MCP Server`);
  lines.push("// Auto-generated — validates generated code matches analysis.json");
  lines.push('import { describe, it, expect } from "vitest";');
  lines.push('import { TOOL_REGISTRY, safetyToAnnotations, getToolMeta, getToolsByDomain, getToolsByCategory, TOOL_COUNT } from "../../src/tools/registry.js";');
  lines.push("");

  lines.push("describe(\"TOOL_REGISTRY contract\", () => {");

  lines.push(`  it("contains all ${analysis.capabilities.length} capabilities from analysis.json", () => {`);
  lines.push(`    expect(TOOL_REGISTRY).toHaveLength(${analysis.capabilities.length});`);
  lines.push("  });");
  lines.push("");

  for (const cap of analysis.capabilities) {
    lines.push(`  it("${cap.id} exists in registry with correct metadata", () => {`);
    lines.push(`    const entry = TOOL_REGISTRY.find(e => e.id === "${cap.id}");`);
    lines.push("    expect(entry).toBeDefined();");
    lines.push(`    expect(entry!.domain).toBe("${cap.domain}");`);
    lines.push(`    expect(entry!.safetyLevel).toBe("${cap.safetyLevel}");`);
    lines.push(`    expect(entry!.object).toBe("${cap.object}");`);
    lines.push(`    expect(entry!.action).toBe("${cap.action}");`);
    if (cap.sdkCalls.length > 0) {
      lines.push(`    expect(entry!.sdkCalls).toEqual([${cap.sdkCalls.map(s => `"${s}"`).join(", ")}]);`);
    }
    lines.push("  });");
    lines.push("");
  }

  lines.push("  it(\"has unique tool IDs\", () => {");
  lines.push("    const ids = TOOL_REGISTRY.map(e => e.id);");
  lines.push("    expect(new Set(ids).size).toBe(ids.length);");
  lines.push("  });");

  lines.push("");
  lines.push("  describe(\"description consistency\", () => {");
  for (const cap of analysis.capabilities) {
    const expectedDesc = `${cap.action} ${cap.object}`;
    lines.push(`    it("${cap.id} description matches action and object from analysis.json", () => {`);
    lines.push(`      const entry = TOOL_REGISTRY.find(e => e.id === "${cap.id}");`);
    lines.push("      expect(entry).toBeDefined();");
    lines.push(`      const expected = \`${cap.action} ${cap.object}\`;`);
    lines.push(`      expect(\`\${entry!.action} \${entry!.object}\`).toBe(expected);`);
    lines.push("    });");
  }
  lines.push("  });");

  lines.push("");
  lines.push("  describe(\"safety level mapping\", () => {");
  const validSafetyLevels = ["readonly", "normal", "p_gear_required", "p_gear_and_confirm", "p_gear_and_network"];
  lines.push(`    const validLevels = new Set(${JSON.stringify(validSafetyLevels)});`);
  lines.push("    it(\"every entry has a valid safety level\", () => {");
  lines.push("      for (const entry of TOOL_REGISTRY) {");
  lines.push("        expect(validLevels.has(entry.safetyLevel)).toBe(true);");
  lines.push("      }");
  lines.push("    });");

  const safetyGroups = new Map<string, string[]>();
  for (const cap of analysis.capabilities) {
    const existing = safetyGroups.get(cap.safetyLevel) ?? [];
    existing.push(cap.id);
    safetyGroups.set(cap.safetyLevel, existing);
  }
  for (const [level, ids] of safetyGroups) {
    lines.push(`    it("${level} capabilities are correctly classified", () => {`);
    lines.push(`      const expected = ${JSON.stringify(ids)};`);
    lines.push("      const actual = TOOL_REGISTRY");
    lines.push(`        .filter(e => e.safetyLevel === "${level}")`);
    lines.push("        .map(e => e.id);");
    lines.push("      expect(actual.sort()).toEqual(expected.sort());");
    lines.push("    });");
  }
  lines.push("  });");

  lines.push("");
  lines.push("  describe(\"domain groupings\", () => {");
  const domainGroups = new Map<string, string[]>();
  for (const cap of analysis.capabilities) {
    const existing = domainGroups.get(cap.domain) ?? [];
    existing.push(cap.id);
    domainGroups.set(cap.domain, existing);
  }
  for (const [domain, ids] of domainGroups) {
    lines.push(`    it("${domain} domain covers all ${ids.length} capabilities", () => {`);
    lines.push(`      const expected = ${JSON.stringify(ids)};`);
    lines.push("      const actual = TOOL_REGISTRY");
    lines.push(`        .filter(e => e.domain === "${domain}")`);
    lines.push("        .map(e => e.id);");
    lines.push("      expect(actual.sort()).toEqual(expected.sort());");
    lines.push("    });");
  }
  lines.push("    it(\"every registry entry belongs to a known domain\", () => {");
  lines.push(`      const knownDomains = new Set(${JSON.stringify([...domainGroups.keys()])});`);
  lines.push("      for (const entry of TOOL_REGISTRY) {");
  lines.push("        expect(knownDomains.has(entry.domain)).toBe(true);");
  lines.push("      }");
  lines.push("    });");
  lines.push("  });");

  lines.push("});");
  lines.push("");

  lines.push("describe(\"safetyToAnnotations\", () => {");
  lines.push("  it(\"readonly → readOnlyHint + idempotentHint\", () => {");
  lines.push("    const a = safetyToAnnotations(\"readonly\");");
  lines.push("    expect(a.readOnlyHint).toBe(true);");
  lines.push("    expect(a.idempotentHint).toBe(true);");
  lines.push("    expect(a.destructiveHint).toBeUndefined();");
  lines.push("    expect(a.openWorldHint).toBeUndefined();");
  lines.push("  });");
  lines.push("");
  lines.push("  it(\"normal → no hints\", () => {");
  lines.push("    const a = safetyToAnnotations(\"normal\");");
  lines.push("    expect(a.readOnlyHint).toBeUndefined();");
  lines.push("    expect(a.destructiveHint).toBeUndefined();");
  lines.push("    expect(a.idempotentHint).toBeUndefined();");
  lines.push("    expect(a.openWorldHint).toBeUndefined();");
  lines.push("  });");
  lines.push("");
  lines.push("  it(\"p_gear_required → destructiveHint\", () => {");
  lines.push("    const a = safetyToAnnotations(\"p_gear_required\");");
  lines.push("    expect(a.destructiveHint).toBe(true);");
  lines.push("    expect(a.readOnlyHint).toBeUndefined();");
  lines.push("  });");
  lines.push("");
  lines.push("  it(\"p_gear_and_confirm → destructiveHint\", () => {");
  lines.push("    const a = safetyToAnnotations(\"p_gear_and_confirm\");");
  lines.push("    expect(a.destructiveHint).toBe(true);");
  lines.push("  });");
  lines.push("");
  lines.push("  it(\"p_gear_and_network → destructiveHint + openWorldHint\", () => {");
  lines.push("    const a = safetyToAnnotations(\"p_gear_and_network\");");
  lines.push("    expect(a.openWorldHint).toBe(true);");
  lines.push("    expect(a.destructiveHint).toBe(true);");
  lines.push("  });");
  lines.push("});");
  lines.push("");

  lines.push("describe(\"TOOL_COUNT\", () => {");
  lines.push(`  it("matches TOOL_REGISTRY length", () => {`);
  lines.push("    expect(TOOL_COUNT).toBe(TOOL_REGISTRY.length);");
  lines.push(`    expect(TOOL_COUNT).toBe(${analysis.capabilities.length});`);
  lines.push("  });");
  lines.push("});");
  lines.push("");

  lines.push("describe(\"getToolMeta\", () => {");
  for (const cap of analysis.capabilities.slice(0, 3)) {
    lines.push(`  it("returns entry for ${cap.id}", () => {`);
    lines.push(`    const meta = getToolMeta("${cap.id}");`);
    lines.push("    expect(meta).toBeDefined();");
    lines.push(`    expect(meta!.id).toBe("${cap.id}");`);
    lines.push("  });");
    lines.push("");
  }
  lines.push("  it(\"returns undefined for unknown tool\", () => {");
  lines.push("    expect(getToolMeta(\"nonexistent_tool_xyz\")).toBeUndefined();");
  lines.push("  });");
  lines.push("});");
  lines.push("");

  lines.push("describe(\"getToolsByDomain\", () => {");
  const domainGroups2 = new Map<string, string[]>();
  for (const cap of analysis.capabilities) {
    const existing = domainGroups2.get(cap.domain) ?? [];
    existing.push(cap.id);
    domainGroups2.set(cap.domain, existing);
  }
  for (const [domain, ids] of domainGroups2) {
    lines.push(`  it("${domain} domain returns ${ids.length} tools", () => {`);
    lines.push(`    const tools = getToolsByDomain("${domain}");`);
    lines.push(`    expect(tools).toHaveLength(${ids.length});`);
    lines.push("    expect(tools.every(t => t.domain === \"" + domain + "\")).toBe(true);");
    lines.push("  });");
    lines.push("");
  }
  lines.push("  it(\"returns empty for unknown domain\", () => {");
  lines.push("    expect(getToolsByDomain(\"nonexistent_domain\")).toHaveLength(0);");
  lines.push("  });");
  lines.push("});");
  lines.push("");

  lines.push("describe(\"getToolsByCategory\", () => {");
  const safetyGroups2 = new Map<string, string[]>();
  for (const cap of analysis.capabilities) {
    const existing = safetyGroups2.get(cap.safetyLevel) ?? [];
    existing.push(cap.id);
    safetyGroups2.set(cap.safetyLevel, existing);
  }
  for (const [level, ids] of safetyGroups2) {
    lines.push(`  it("${level} category returns ${ids.length} tools", () => {`);
    lines.push(`    const tools = getToolsByCategory("${level}");`);
    lines.push(`    expect(tools).toHaveLength(${ids.length});`);
    lines.push("    expect(tools.every(t => t.safetyLevel === \"" + level + "\")).toBe(true);");
    lines.push("  });");
    lines.push("");
  }
  lines.push("});");
  lines.push("");

  lines.push("describe(\"annotation consistency\", () => {");
  lines.push("  for (const entry of TOOL_REGISTRY) {");
  lines.push("    it(`${entry.id} annotations match safety level ${entry.safetyLevel}`, () => {");
  lines.push("      const annotations = safetyToAnnotations(entry.safetyLevel);");
  lines.push("      if (entry.safetyLevel === \"readonly\") {");
  lines.push("        expect(annotations.readOnlyHint).toBe(true);");
  lines.push("        expect(annotations.idempotentHint).toBe(true);");
  lines.push("      }");
  lines.push("      if (entry.safetyLevel === \"normal\") {");
  lines.push("        expect(Object.keys(annotations)).toHaveLength(0);");
  lines.push("      }");
  lines.push("      if (entry.safetyLevel === \"p_gear_required\" || entry.safetyLevel === \"p_gear_and_confirm\" || entry.safetyLevel === \"p_gear_and_network\") {");
  lines.push("        expect(annotations.destructiveHint).toBe(true);");
  lines.push("      }");
  lines.push("      if (entry.safetyLevel === \"p_gear_and_network\") {");
  lines.push("        expect(annotations.openWorldHint).toBe(true);");
  lines.push("      }");
  lines.push("    });");
  lines.push("  }");
  lines.push("});");
  lines.push("");

  return lines.join("\n") + "\n";
}
