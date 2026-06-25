import type { AnalysisData, ParamDef, TypedField } from "../types.js";
import { tsType, toDtoName, inferFieldType, safeFieldName, buildMethodMap } from "./adapter-types.js";

function delayExpr(): string {
  return "await new Promise((r) => setTimeout(r, 5));";
}

function fieldName(f: string | TypedField): string {
  return typeof f === "string" ? f : f.name;
}

function defaultForType(type: string, n: string): string {
  switch (type) {
    case "boolean": return `${n}: false`;
    case "number": return `${n}: 0`;
    default: return `${n}: ""`;
  }
}

/** N11/N12: the mock constructs the SAME envelope the real device returns ({ result: { data: ... } }
 *  for json read ops; scalar 0 for double set ops) and then unwraps it exactly as the generated
 *  yunos adapter's applyReply() does — so the round-trip is exercised and downstream consumers
 *  still receive the DTO shape. The envelope literal stays in the source (proof the mock is realistic). */
function defaultReturn(dtoName: string, fields: readonly (string | TypedField)[], action: string): string {
  void dtoName;
  const nonEmpty = fields.filter((f) => fieldName(f) && fieldName(f) !== "success");
  const fieldValues = nonEmpty.map((f) => {
    const n = safeFieldName(fieldName(f));
    if (n.toLowerCase().includes("isparked")) return `${n}: state.gearStatus === "P"`;
    if (n.toLowerCase().includes("gear") && !n.toLowerCase().includes("isparked")) return `${n}: state.gearStatus`;
    if ((n === "currentPage" || n === "currentpage")) return `${n}: state.pageStack[state.pageStack.length - 1]`;
    if (n === "stackDepth" || n === "stackdepth") return `${n}: state.pageStack.length`;
    if (/^(is|has|can|should)/i.test(n)) return `${n}: true`;
    if (/enabled|active|visible|loading|playing|paused|available/i.test(n)) return `${n}: true`;
    if (n.toLowerCase().includes("ignoremode")) return `${n}: "false"`;
    if (n.toLowerCase().includes("rawvalue")) return `${n}: 2`;
    if (/id$/i.test(n)) return `${n}: nextMockId()`;
    if (inferFieldType(n) === "number" && /(timestamp|time|date)/i.test(n)) return `${n}: Date.now()`;
    if (/url|uri|href|path$/i.test(n)) return `${n}: "mock://test"`;
    if (/message|msg|text/i.test(n)) return `${n}: "mock response"`;
    if (n.toLowerCase().includes("name")) return `${n}: "test"`;
    if (n.toLowerCase().includes("count")) return `${n}: state.pageStack.length`;
    return defaultForType(inferFieldType(n), n);
  });

  // set op → device returns scalar 0 (readDouble convention: 0 = success). The mock returns the
  // raw scalar 0; the generated yunos adapter's scalarSnippet maps it onto success.
  if (action === "set" && nonEmpty.length === 0) {
    return `{ return 0 ${castSuffix(dtoName)}; }`;
  }
  // read op (or set with non-success fields) → PolicyResponse envelope, then unwrap result.data.
  const inner = `{ ${fieldValues.join(", ")} }`;
  return `{ const mockReply = frozen<{ result: { data: Record<string, unknown> } }>({ result: { data: ${inner} } }); const payload = mockReply.result.data; return frozen({ success: true, ...(payload as Record<string, unknown>) } as object) ${castSuffix(dtoName)}; }`;
}

function castSuffix(dtoName: string): string {
  return dtoName ? `as unknown as ${dtoName}` : "";
}

export function generateMockAdapter(analysis: AnalysisData): string {
  const lines: string[] = [];
  const dtoNames = analysis.capabilities
    .filter((c) => c.returns)
    .map((c) => toDtoName(c.id));

  lines.push("// Auto-generated mock adapter — returns safe defaults for testing");
  lines.push("import type { IAdapter" + (dtoNames.length > 0 ? ", " + dtoNames.join(", ") : "") + " } from \"./types.js\";");
  lines.push("");
  lines.push("export interface MockAdapterState {");
  lines.push("  readonly pageStack: readonly string[];");
  lines.push("  readonly gearStatus: string;");
  lines.push("  readonly isLoading: boolean;");
  lines.push("  readonly activeToast: string | null;");
  lines.push("}");
  lines.push("");
  lines.push("export interface MockAdapterControl {");
  lines.push("  setError(method: string, error: Error | null): void;");
  lines.push("  setGearStatus(status: string): void;");
  lines.push("  getMockState(): MockAdapterState;");
  lines.push("  resetState(): void;");
  lines.push("  setLoading(value: boolean): void;");
  lines.push("  showToast(message: string): void;");
  lines.push("  dismissToast(): void;");
  lines.push("  subscribeGearChange(listener: (gear: string) => void): void;");
  lines.push("  unsubscribeGearChange(listener: (gear: string) => void): void;");
  lines.push("}");
  lines.push("");

  lines.push("function frozen<T>(obj: T): T {");
  lines.push("  return Object.freeze(structuredClone(obj)) as T;");
  lines.push("}");
  lines.push("");

  lines.push("export function createMockAdapter(): { adapter: IAdapter; control: MockAdapterControl } {");
  lines.push("  const errors = new Map<string, Error>();");
  lines.push("  let mockIdCounter = 0;");
  lines.push("  function nextMockId(): string {");
  lines.push("    mockIdCounter += 1;");
  lines.push("    return `mock-${mockIdCounter}`;");
  lines.push("  }");
  lines.push("  const gearListeners = new Set<(gear: string) => void>();");
  lines.push("  function notifyGearChange(gear: string): void {");
  lines.push("    for (const fn of gearListeners) { fn(gear); }");
  lines.push("  }");
  lines.push("");
  lines.push("  let state: MockAdapterState = {");
  lines.push("    pageStack: [\"home\"],");
  lines.push("    gearStatus: \"P\",");
  lines.push("    isLoading: false,");
  lines.push("    activeToast: null,");
  lines.push("  };");
  lines.push("");
  lines.push("  function checkError(method: string): void {");
  lines.push("    const err = errors.get(method);");
  lines.push("    if (err) throw err;");
  lines.push("  }");
  lines.push("");

  const hasNavigation = analysis.capabilities.some((c) => c.action === "navigate_to" || c.action.includes("navigate"));
  if (hasNavigation) {
    lines.push("  function pushPage(page: string): void {");
    lines.push("    state = { ...state, pageStack: [...state.pageStack, page] };");
    lines.push("  }");
    lines.push("");
    lines.push("  function popPage(): void {");
    lines.push("    if (state.pageStack.length > 1) {");
    lines.push("      state = { ...state, pageStack: state.pageStack.slice(0, -1) };");
    lines.push("    }");
    lines.push("  }");
    lines.push("");
  }

  lines.push("  const adapter: IAdapter = {");
  lines.push("    isMock: true,");

  const methodMap = buildMethodMap(analysis);

  for (const cap of analysis.capabilities) {
    const methodName = methodMap.get(cap.id)!;
    const params = (cap.params ?? []).map((p) => `${safeFieldName(p.name)}${p.optional ? "?" : ""}: ${tsType(p.type)}`);
    lines.push("");
    const retType = cap.returns ? toDtoName(cap.id) : "unknown";
    const bodyLines: string[] = [];
    bodyLines.push(delayExpr());
    bodyLines.push(`checkError("${methodName}");`);

    if (hasNavigation && cap.action === "navigate_to") {
      const pageParam = cap.params?.find((p) => p.name.toLowerCase().includes("page") || p.name.toLowerCase().includes("target") || p.name.toLowerCase().includes("destination"));
      if (pageParam) {
        bodyLines.push(`pushPage(${pageParam.name});`);
      }
    } else if (hasNavigation && (cap.action === "go_back" || cap.action === "navigate_back")) {
      bodyLines.push("popPage();");
    } else if (cap.action === "show" && cap.object === "toast") {
      const msgParam = cap.params?.find((p) => /message|text|content|msg|body|info/i.test(p.name));
      bodyLines.push(`state = { ...state, activeToast: ${msgParam ? safeFieldName(msgParam.name) : '"toast"'} };`);
    } else if (cap.action === "show" && cap.object === "loading") {
      bodyLines.push(`state = { ...state, isLoading: true };`);
    } else if (cap.action === "hide" && cap.object === "loading") {
      bodyLines.push(`state = { ...state, isLoading: false };`);
    }

    if (cap.returns) {
      // defaultReturn emits its own block (constructs the device envelope then unwraps → DTO).
      bodyLines.push(defaultReturn(retType, (cap.returns?.fields ?? []), cap.action));
    } else {
      bodyLines.push(`return undefined as unknown as Promise<${retType}>;`);
    }

    lines.push(`    async ${methodName}(${params.join(", ")}): Promise<${retType}> {`);
    for (const bl of bodyLines) {
      lines.push(`      ${bl}`);
    }
    lines.push("    },");
  }

  lines.push("  };");
  lines.push("");

  lines.push("  const control: MockAdapterControl = {");
  lines.push("    setError(method: string, error: Error | null): void {");
  lines.push("      if (error === null) { errors.delete(method); }");
  lines.push("      else { errors.set(method, error); }");
  lines.push("    },");
  lines.push("    setGearStatus(status: string): void {");
  lines.push("      state = { ...state, gearStatus: status };");
  lines.push("      notifyGearChange(status);");
  lines.push("    },");
  lines.push("    getMockState(): MockAdapterState {");
  lines.push("      return frozen(state);");
  lines.push("    },");
  lines.push("    resetState(): void {");
  lines.push("      errors.clear();");
  lines.push("      gearListeners.clear();");
  lines.push("      mockIdCounter = 0;");
  lines.push("      state = {");
  lines.push("        pageStack: [\"home\"],");
  lines.push("        gearStatus: \"P\",");
  lines.push("        isLoading: false,");
  lines.push("        activeToast: null,");
  lines.push("      };");
  lines.push("    },");
  lines.push("    setLoading(value: boolean): void {");
  lines.push("      state = { ...state, isLoading: value };");
  lines.push("    },");
  lines.push("    showToast(message: string): void {");
  lines.push("      state = { ...state, activeToast: message };");
  lines.push("    },");
  lines.push("    dismissToast(): void {");
  lines.push("      state = { ...state, activeToast: null };");
  lines.push("    },");
  lines.push("    subscribeGearChange(listener: (gear: string) => void): void {");
  lines.push("      gearListeners.add(listener);");
  lines.push("    },");
  lines.push("    unsubscribeGearChange(listener: (gear: string) => void): void {");
  lines.push("      gearListeners.delete(listener);");
  lines.push("    },");
  lines.push("  };");
  lines.push("");

  lines.push("  return { adapter, control };");
  lines.push("}");
  lines.push("");

  return lines.join("\n") + "\n";
}
