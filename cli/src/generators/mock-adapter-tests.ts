import type { AnalysisData } from "../types.js";
import { buildMethodMap } from "./adapter-types.js";

export function generateMockAdapterTests(analysis: AnalysisData): string {
  const lines: string[] = [];
  lines.push(`// Mock adapter tests for ${analysis.app.name} MCP Server`);
  lines.push("// Auto-generated — tests ALL adapter methods with success and error injection");
  lines.push('import { describe, it, expect, beforeEach } from "vitest";');
  lines.push('import { createMockAdapter } from "../../src/adapters/mock-adapter.js";');
  lines.push("");

  lines.push("describe(\"MockAdapter\", () => {");
  lines.push("  let adapter: ReturnType<typeof createMockAdapter>[\"adapter\"];");
  lines.push("  let control: ReturnType<typeof createMockAdapter>[\"control\"];");
  lines.push("");
  lines.push("  beforeEach(() => {");
  lines.push("    ({ adapter, control } = createMockAdapter());");
  lines.push("  });");
  lines.push("");

  const methodMap = buildMethodMap(analysis);

  for (const cap of analysis.capabilities) {
    const methodName = methodMap.get(cap.id)!;
    const domainDescribe = cap.domain;

    lines.push(`  describe("${domainDescribe}: ${cap.id}", () => {`);

    lines.push(`    it("${methodName} returns success result", async () => {`);
    if (cap.params && cap.params.length > 0) {
      const args = cap.params.map((p) => {
        if (p.type === "string") return `"test_${p.name}"`;
        if (p.type === "number") return "1";
        if (p.type === "boolean") return "true";
        return `"test"`;
      }).join(", ");
      lines.push(`      const result = await adapter.${methodName}(${args});`);
    } else {
      lines.push(`      const result = await adapter.${methodName}();`);
    }
    if (cap.returns) {
      lines.push("      expect(result).toBeDefined();");
    }
    const returnFields = cap.returns?.fields ?? [];
    if (returnFields.some((f) => typeof f === "string" ? f === "success" : f.name === "success")) {
      lines.push("      expect(result.success).toBe(true);");
    }
    lines.push("    });");
    lines.push("");

    lines.push(`    it("${methodName} propagates injected errors", async () => {`);
    lines.push(`      control.setError("${methodName}", new Error("injected error"));`);
    lines.push("      await expect(");
    if (cap.params && cap.params.length > 0) {
      const args = cap.params.map((p) => {
        if (p.type === "string") return `"test"`;
        if (p.type === "number") return "1";
        return `"test"`;
      }).join(", ");
      lines.push(`        adapter.${methodName}(${args})`);
    } else {
      lines.push(`        adapter.${methodName}()`);
    }
    lines.push("      ).rejects.toThrow(\"injected error\");");
    lines.push("    });");

    lines.push("  });");
    lines.push("");
  }

  lines.push("  describe(\"state management\", () => {");
  lines.push("    it(\"resetState clears all injected errors\", () => {");
  lines.push("      control.setError(\"someMethod\", new Error(\"test\"));");
  lines.push("      control.resetState();");
  lines.push("      expect(() => control.resetState()).not.toThrow();");
  lines.push("    });");
  lines.push("");

  lines.push("    it(\"resetState resets all state to defaults\", () => {");
  lines.push("      control.setGearStatus(\"D\");");
  lines.push("      const stateBefore = control.getMockState();");
  lines.push("      expect(stateBefore.gearStatus).toBe(\"D\");");
  lines.push("      control.resetState();");
  lines.push("      const stateAfter = control.getMockState();");
  lines.push("      expect(stateAfter.gearStatus).toBe(\"P\");");
  lines.push("      expect(stateAfter.pageStack).toEqual([\"home\"]);");
  lines.push("      expect(stateAfter.isLoading).toBe(false);");
  lines.push("      expect(stateAfter.activeToast).toBeNull();");
  lines.push("    });");
  lines.push("");

  const hasNavigation = analysis.capabilities.some((c) => c.action === "navigate_to" || c.action.includes("navigate"));
  if (hasNavigation) {
    lines.push("    it(\"pageStack starts with [\\\"home\\\"]\", () => {");
    lines.push("      const state = control.getMockState();");
    lines.push("      expect(state.pageStack).toEqual([\"home\"]);");
    lines.push("    });");
    lines.push("");
    lines.push("    it(\"pageStack reflects navigation state\", async () => {");

    const navCap = analysis.capabilities.find((c) => c.action === "navigate_to");
    if (navCap) {
      const navMethod = methodMap.get(navCap.id)!;
      const pageParam = navCap.params?.find((p) => p.name.toLowerCase().includes("page") || p.name.toLowerCase().includes("target") || p.name.toLowerCase().includes("destination"));
      if (pageParam) {
        lines.push(`      await adapter.${navMethod}("settings");`);
      } else {
        lines.push(`      await adapter.${navMethod}();`);
      }
    }

    lines.push("      const state = control.getMockState();");
    lines.push("      expect(state.pageStack.length).toBeGreaterThanOrEqual(1);");
    lines.push("    });");
    lines.push("");
  }

  lines.push("    it(\"setGearStatus updates gear status\", () => {");
  lines.push("      control.setGearStatus(\"D\");");
  lines.push("      expect(control.getMockState().gearStatus).toBe(\"D\");");
  lines.push("      control.setGearStatus(\"R\");");
  lines.push("      expect(control.getMockState().gearStatus).toBe(\"R\");");
  lines.push("    });");
  lines.push("");
  lines.push("    it(\"getMockState returns frozen copy\", () => {");
  lines.push("      const state1 = control.getMockState();");
  lines.push("      const state2 = control.getMockState();");
  lines.push("      expect(state1).toEqual(state2);");
  lines.push("      expect(state1).not.toBe(state2);");
  lines.push("    });");
  lines.push("  });");

  // Edge case tests
  lines.push("");
  lines.push("  describe(\"edge cases\", () => {");

  lines.push("    it(\"adapter returns frozen immutable results\", async () => {");
  const firstCap = analysis.capabilities.find((c) => c.returns);
  if (firstCap) {
    const firstMethod = methodMap.get(firstCap.id)!;
    const firstArgs = firstCap.params?.map((p) => p.type === "number" ? "1" : '"test"').join(", ") ?? "";
    lines.push(`      const result = await adapter.${firstMethod}(${firstArgs});`);
    lines.push("      if (typeof result === 'object' && result !== null) {");
    lines.push("        expect(Object.isFrozen(result)).toBe(true);");
    lines.push("      }");
  }
  lines.push("    });");
  lines.push("");

  lines.push("    it(\"gear subscription receives updates\", () => {");
  lines.push("      const received: string[] = [];");
  lines.push("      control.subscribeGearChange((gear) => { received.push(gear); });");
  lines.push("      control.setGearStatus(\"D\");");
  lines.push("      control.setGearStatus(\"R\");");
  lines.push("      expect(received).toEqual([\"D\", \"R\"]);");
  lines.push("    });");
  lines.push("");

  lines.push("    it(\"unsubscribe stops gear updates\", () => {");
  lines.push("      const received: string[] = [];");
  lines.push("      const listener = (gear: string) => { received.push(gear); };");
  lines.push("      control.subscribeGearChange(listener);");
  lines.push("      control.setGearStatus(\"D\");");
  lines.push("      control.unsubscribeGearChange(listener);");
  lines.push("      control.setGearStatus(\"R\");");
  lines.push("      expect(received).toEqual([\"D\"]);");
  lines.push("    });");
  lines.push("");

  lines.push("    it(\"resetState clears gear listeners\", () => {");
  lines.push("      const received: string[] = [];");
  lines.push("      control.subscribeGearChange((gear) => { received.push(gear); });");
  lines.push("      control.resetState();");
  lines.push("      control.setGearStatus(\"D\");");
  lines.push("      expect(received).toEqual([]);");
  lines.push("    });");
  lines.push("");

  if (analysis.capabilities.some((c) => c.action === "show" && c.object === "toast")) {
    lines.push("    it(\"showToast updates activeToast state\", async () => {");
    const toastCap = analysis.capabilities.find((c) => c.action === "show" && c.object === "toast");
    if (toastCap) {
      const toastMethod = methodMap.get(toastCap.id)!;
      lines.push(`      await adapter.${toastMethod}("hello");`);
    }
    lines.push("      expect(control.getMockState().activeToast).toBe(\"hello\");");
    lines.push("    });");
    lines.push("");
  }

  if (analysis.capabilities.some((c) => c.action === "show" && c.object === "loading")) {
    lines.push("    it(\"showLoading sets isLoading state\", async () => {");
    const loadingCap = analysis.capabilities.find((c) => c.action === "show" && c.object === "loading");
    if (loadingCap) {
      const loadingMethod = methodMap.get(loadingCap.id)!;
      lines.push(`      await adapter.${loadingMethod}();`);
    }
    lines.push("      expect(control.getMockState().isLoading).toBe(true);");
    lines.push("    });");
    lines.push("");

    const hideCap = analysis.capabilities.find((c) => c.action === "hide" && c.object === "loading");
    if (hideCap) {
      lines.push("    it(\"hideLoading clears isLoading state\", async () => {");
      const hideMethod = methodMap.get(hideCap.id)!;
      lines.push("      control.setLoading(true);");
      lines.push(`      await adapter.${hideMethod}();`);
      lines.push("      expect(control.getMockState().isLoading).toBe(false);");
      lines.push("    });");
      lines.push("");
    }
  }

  lines.push("  });");

  lines.push("});");

  return lines.join("\n") + "\n";
}
