import { readFileSync } from "fs";
import { resolve } from "path";
import type { AnalysisData } from "../types.js";

export interface CandidateRow { id: string; action_object: string; paramCount: number; hasReturns: boolean; safety: string; sourceRef: string; prdHit?: string; }

export function enumerateCandidates(analysis: AnalysisData, prdText?: string): CandidateRow[] {
  return analysis.capabilities.map((c) => {
    const row: CandidateRow = { id: c.id, action_object: `${c.action} ${c.object}`, paramCount: (c.params ?? []).length, hasReturns: !!c.returns, safety: c.safetyLevel, sourceRef: c.sourceRef };
    if (prdText) { const m = prdText.match(new RegExp(`.{0,40}(?:${c.action}|${c.object}).{0,40}`, "i")); if (m?.[0]) row.prdHit = m[0].trim(); }
    return row;
  });
}

export async function curateCommand(args: string[]): Promise<void> {
  const analysisPath = args.find((a) => !a.startsWith("--"));
  const prdFlag = args.indexOf("--prd");
  if (!analysisPath) throw new Error("Usage: mcp-pipeline curate <analysis.json> [--prd <prd.md>]");
  const analysis = JSON.parse(readFileSync(resolve(analysisPath), "utf-8")) as AnalysisData;
  const prdText = prdFlag !== -1 && args[prdFlag + 1] ? readFileSync(resolve(args[prdFlag + 1]), "utf-8") : undefined;
  if (!prdText) process.stderr.write("[curate] no PRD — code-only\n");
  process.stdout.write("id | action_object | params | returns | safety | sourceRef | prd-hit\n");
  for (const r of enumerateCandidates(analysis, prdText)) process.stdout.write([r.id, r.action_object, r.paramCount, r.hasReturns, r.safety, r.sourceRef, r.prdHit ?? "-"].join(" | ") + "\n");
}
