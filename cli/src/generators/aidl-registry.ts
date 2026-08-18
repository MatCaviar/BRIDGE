import type { AnalysisData } from "../types.js";

/** Derive the AIDL method name from a capability sourceRef "File.kt:methodName".
 *  The capability id is snake_case; the AIDL method the executor must call is the sourceRef's
 *  camelCase method (e.g. id "set_mic_vocal" → method "setMicVocal"). */
function methodNameFromSourceRef(sourceRef: string): string {
  const idx = sourceRef.lastIndexOf(":");
  return idx === -1 ? sourceRef : sourceRef.slice(idx + 1);
}

/** Project analysis → registry.json consumed by the car executor (dispatch table) and validated by
 *  Gate A/B. Pure data projection — no judgment: pattern/devicePaths/form/status come from analyze,
 *  methodName comes from sourceRef. Identical code for every android-kotlin app. */
export function generateAidlRegistry(analysis: AnalysisData): string {
  const tools = analysis.capabilities.map((c) => ({
    id: c.id,
    methodName: methodNameFromSourceRef(c.sourceRef),
    pattern: c.pattern ?? "none",
    dataClass: c.dataClass,
    devicePaths: c.devicePaths ?? [],
    form: c.form ?? "binder",
    safetyLevel: c.safetyLevel,
    status: c.status ?? "verified",
    sourceRef: c.sourceRef,
  }));
  const registry = {
    app: analysis.app.name,
    framework: analysis.app.framework,
    nativeCallTool: analysis.app.nativeCallTool ?? false,
    deviceSources: analysis.app.deviceSources ?? [],
    tools,
  };
  return JSON.stringify(registry, null, 2) + "\n";
}
