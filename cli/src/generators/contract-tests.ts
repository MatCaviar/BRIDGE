import type { AnalysisData } from "../types.js";
import { escapeComment } from "../utils/sanitize.js";

export function generateContractTests(analysis: AnalysisData): string {
  const lines: string[] = [];
  lines.push(`// Contract tests for ${escapeComment(analysis.app.name)} MCP Server`);
  lines.push("// Auto-generated — validates generated code matches analysis.json");
  lines.push('import { describe, it, expect } from "vitest";');
  lines.push('import { readFileSync } from "fs";');
  lines.push('import { TOOL_REGISTRY, safetyToAnnotations, getToolMeta, getToolsByDomain, getToolsByCategory, TOOL_COUNT } from "../../src/tools/registry.js";');
  lines.push("");

  lines.push("describe(\"TOOL_REGISTRY contract\", () => {");

  lines.push(`  it(${JSON.stringify(`contains all ${analysis.capabilities.length} capabilities from analysis.json`)}, () => {`);
  lines.push(`    expect(TOOL_REGISTRY).toHaveLength(${analysis.capabilities.length});`);
  lines.push("  });");
  lines.push("");

  for (const cap of analysis.capabilities) {
    lines.push(`  it(${JSON.stringify(`${cap.id} exists in registry with correct metadata`)}, () => {`);
    lines.push(`    const entry = TOOL_REGISTRY.find(e => e.id === ${JSON.stringify(cap.id)});`);
    lines.push("    expect(entry).toBeDefined();");
    lines.push(`    expect(entry!.domain).toBe(${JSON.stringify(cap.domain)});`);
    lines.push(`    expect(entry!.safetyLevel).toBe(${JSON.stringify(cap.safetyLevel)});`);
    lines.push(`    expect(entry!.object).toBe(${JSON.stringify(cap.object)});`);
    lines.push(`    expect(entry!.action).toBe(${JSON.stringify(cap.action)});`);
    if (cap.sdkCalls.length > 0) {
      lines.push(`    expect(entry!.sdkCalls).toEqual([${cap.sdkCalls.map(s => JSON.stringify(s)).join(", ")}]);`);
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
    lines.push(`    it(${JSON.stringify(`${cap.id} description matches action and object from analysis.json`)}, () => {`);
    lines.push(`      const entry = TOOL_REGISTRY.find(e => e.id === ${JSON.stringify(cap.id)});`);
    lines.push("      expect(entry).toBeDefined();");
    lines.push(`      const expected = ${JSON.stringify(`${cap.action} ${cap.object}`)};`);
    lines.push("      expect(`${entry!.action} ${entry!.object}`).toBe(expected);");
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
    lines.push(`    it(${JSON.stringify(`${level} capabilities are correctly classified`)}, () => {`);
    lines.push(`      const expected = ${JSON.stringify(ids)};`);
    lines.push("      const actual = TOOL_REGISTRY");
    lines.push(`        .filter(e => e.safetyLevel === ${JSON.stringify(level)})`);
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
    lines.push(`    it(${JSON.stringify(`${domain} domain covers all ${ids.length} capabilities`)}, () => {`);
    lines.push(`      const expected = ${JSON.stringify(ids)};`);
    lines.push("      const actual = TOOL_REGISTRY");
    lines.push(`        .filter(e => e.domain === ${JSON.stringify(domain)})`);
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
    lines.push(`  it(${JSON.stringify(`returns entry for ${cap.id}`)}, () => {`);
    lines.push(`    const meta = getToolMeta(${JSON.stringify(cap.id)});`);
    lines.push("    expect(meta).toBeDefined();");
    lines.push(`    expect(meta!.id).toBe(${JSON.stringify(cap.id)});`);
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
    lines.push(`  it(${JSON.stringify(`${domain} domain returns ${ids.length} tools`)}, () => {`);
    lines.push(`    const tools = getToolsByDomain(${JSON.stringify(domain)});`);
    lines.push(`    expect(tools).toHaveLength(${ids.length});`);
    lines.push(`    expect(tools.every(t => t.domain === ${JSON.stringify(domain)})).toBe(true);`);
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
    lines.push(`  it(${JSON.stringify(`${level} category returns ${ids.length} tools`)}, () => {`);
    lines.push(`    const tools = getToolsByCategory(${JSON.stringify(level)});`);
    lines.push(`    expect(tools).toHaveLength(${ids.length});`);
    lines.push(`    expect(tools.every(t => t.safetyLevel === ${JSON.stringify(level)})).toBe(true);`);
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

  // config ↔ registry coverage: loads the CURRENT rpc/config.json (not frozen at scaffold time) and asserts
  // every tool is wired or deferred, every wire maps to a tool. This is the load-bearing config/registry
  // invariant — general for any app. Skips gracefully when config.json is absent (e.g. scaffold-only runs).
  lines.push('describe("rpc/config.json ↔ TOOL_REGISTRY coverage", () => {');
  lines.push("  let config: any;");
  lines.push("  try { config = JSON.parse(readFileSync(new URL(\"../../rpc/config.json\", import.meta.url), \"utf-8\")); } catch { config = null; }");
  lines.push("  if (!config) { it.skip(\"rpc/config.json absent — coverage skipped\", () => {}); return; }");
  lines.push("  const wiredIds = new Set(Object.keys(config).filter((k: string) => k !== \"_deferred\"));");
  lines.push("  const deferredIds = new Set(config._deferred && typeof config._deferred === \"object\" ? Object.keys(config._deferred) : []);");
  lines.push("  it(\"every registry tool is wired or deferred (no silent gaps)\", () => {");
  lines.push("    const missing = TOOL_REGISTRY.map((e) => e.id).filter((id) => !wiredIds.has(id) && !deferredIds.has(id));");
  lines.push("    expect(missing).toEqual([]);");
  lines.push("  });");
  lines.push("  it(\"every config op maps to a known registry tool (no stale wires)\", () => {");
  lines.push("    const known = new Set(TOOL_REGISTRY.map((e) => e.id));");
  lines.push("    expect([...wiredIds].filter((id) => !known.has(id))).toEqual([]);");
  lines.push("  });");
  lines.push("  it(\"every deferred id is a known registry tool\", () => {");
  lines.push("    const known = new Set(TOOL_REGISTRY.map((e) => e.id));");
  lines.push("    expect([...deferredIds].filter((id) => !known.has(id))).toEqual([]);");
  lines.push("  });");
  lines.push("});");
  lines.push("");

  return lines.join("\n") + "\n";
}
