import { readFileSync } from "node:fs";
import type { AnalysisData } from "./types.js";

export function filterAnalysisBySelection(analysis: AnalysisData, requested: readonly string[]): AnalysisData {
  const selected = new Set(requested);
  if (!selected.size) throw new Error("Curate selection is empty");
  const known = new Set(analysis.capabilities.map((capability) => capability.id));
  const unknown = [...selected].filter((id) => !known.has(id));
  if (unknown.length) throw new Error(`Curate selection contains unknown capabilities: ${unknown.join(", ")}`);
  return { ...analysis, capabilities: analysis.capabilities.filter((capability) => selected.has(capability.id)) };
}

export function readSelectedAnalysis(analysisPath: string, selectionPath?: string): AnalysisData {
  const analysis = JSON.parse(readFileSync(analysisPath, "utf8")) as AnalysisData;
  if (!selectionPath) return analysis;
  const selection = JSON.parse(readFileSync(selectionPath, "utf8")) as { selected?: unknown };
  if (!Array.isArray(selection.selected)) throw new Error("selection.json must contain a selected array");
  return filterAnalysisBySelection(analysis, selection.selected.map(String));
}
