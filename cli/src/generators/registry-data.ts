import type { AnalysisData, CapabilityDef, RegistryData, RegistryTool } from "../types.js";

/**
 * generateRegistryData — project analysis.json → registry.json (the on-car bridge executor's
 * dispatch table). Maps each capability's mechanism + mechanism-specific fields 1:1 into a
 * `tools[]` entry the executor (`ExecutorActivity`) can consume: it reads `id` to resolve the
 * tool, `mechanism` to pick the dispatch path (aidl/media/carproperty/audio/caraudio/shell),
 * and the mechanism-specific fields (methodName/pattern/devicePaths / propId/areaId/valueType/mode
 * / command) to execute. Push the output to the executor's `filesDir/registry.json`.
 *
 * Defaults (the analyzer should record the mechanism fields explicitly when non-default):
 *  - mechanism: "aidl" if omitted
 *  - methodName: only for aidl, derived from `sourceRef` ("file:method" → "method")
 *  - pattern: "none" (no params) / "scalar" (has params) unless recorded
 *  - devicePaths: for envelope, `app.deviceSources` → `body.<name>` convention (e.g. "vin" → "body.vin")
 *  - form: "binder" (aidl) / the mechanism name otherwise
 *  - status: "verified" if omitted
 */

/** "IMAudioServiceAdapter.kt:querySoundLibrary" → "querySoundLibrary" */
function methodFromSourceRef(sourceRef: string): string {
  const i = sourceRef.lastIndexOf(":");
  return i >= 0 ? sourceRef.slice(i + 1) : sourceRef;
}

function defaultPattern(cap: CapabilityDef): "none" | "scalar" | "dataclass" | "envelope" {
  if (cap.pattern) return cap.pattern;
  if (cap.mechanism !== "aidl") return "none";
  return cap.params && cap.params.length > 0 ? "scalar" : "none";
}

export function generateRegistryData(analysis: AnalysisData): RegistryData {
  const tools: RegistryTool[] = analysis.capabilities.map((cap) => {
    const mechanism = cap.mechanism ?? "aidl";
    const pattern = defaultPattern(cap);
    const form = mechanism === "aidl" ? "binder" : mechanism;
    const devicePaths =
      cap.devicePaths ?? (pattern === "envelope" ? (analysis.app.deviceSources ?? []).map((s) => `body.${s}`) : undefined);
    return {
      id: cap.id,
      mechanism,
      ...(mechanism === "aidl" ? { methodName: cap.methodName ?? methodFromSourceRef(cap.sourceRef) } : {}),
      pattern,
      ...(devicePaths && devicePaths.length > 0 ? { devicePaths } : {}),
      ...(cap.propId !== undefined ? { propId: cap.propId } : {}),
      ...(cap.areaId !== undefined ? { areaId: cap.areaId } : {}),
      ...(cap.valueType ? { valueType: cap.valueType } : {}),
      ...(cap.mode ? { mode: cap.mode } : {}),
      ...(cap.command ? { command: cap.command } : {}),
      form,
      safetyLevel: cap.safetyLevel,
      status: cap.status ?? "verified",
      sourceRef: cap.sourceRef,
    };
  });

  return {
    app: analysis.app.name,
    framework: analysis.app.framework,
    nativeCallTool: false,
    deviceSources: analysis.app.deviceSources,
    tools,
  };
}
