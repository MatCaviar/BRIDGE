import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import type { AnalysisData } from "../types.js";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

// ── legacy flat-table data API (kept for backward compatibility; covered by curate.test.ts) ──
export interface CandidateRow {
  id: string;
  action_object: string;
  paramCount: number;
  hasReturns: boolean;
  safety: string;
  sourceRef: string;
  prdHit?: string;
}

export function enumerateCandidates(analysis: AnalysisData, prdText?: string): CandidateRow[] {
  return analysis.capabilities.map((c) => {
    const row: CandidateRow = {
      id: c.id,
      action_object: `${c.action} ${c.object}`,
      paramCount: (c.params ?? []).length,
      hasReturns: !!c.returns,
      safety: c.safetyLevel,
      sourceRef: c.sourceRef,
    };
    if (prdText) {
      const m = prdText.match(new RegExp(`.{0,40}(?:${c.action}|${c.object}).{0,40}`, "i"));
      if (m?.[0]) row.prdHit = m[0].trim();
    }
    return row;
  });
}

// ── presentation layer ──────────────────────────────────────────────────────────────────
// Colour is emitted only on a real TTY so piped/agent output stays plain and grep-able.
const COLOR: boolean = process.stdout.isTTY === true;
const paint = (code: string, s: string): string => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s: string): string => paint("1", s);
const dim = (s: string): string => paint("2", s);
const cyan = (s: string): string => paint("36", s);
const green = (s: string): string => paint("32", s);
const yellow = (s: string): string => paint("33", s);
const red = (s: string): string => paint("31", s);

/** Derive a compact kind badge from safety level — single source, used by catalog + selector. */
function deriveKind(safety: string): { icon: string; mark: (s: string) => string } {
  if (safety === "readonly") return { icon: "🟢", mark: green };
  if (safety.startsWith("p_gear")) return { icon: "🔴", mark: red };
  return { icon: "🟡", mark: yellow };
}

function shortSource(ref: string): string {
  // "ts/proxy/AudioPolicyProxy.ts:getSoundStage" → "AudioPolicyProxy.ts:getSoundStage"
  const slash = ref.lastIndexOf("/");
  return slash >= 0 ? ref.slice(slash + 1) : ref;
}

/**
 * High-density candidate catalog, grouped by domain (first-seen order). Pure stdout — safe in
 * both TTY and non-TTY. `selected` (when given) renders [x]/[ ] check marks; omit for a neutral view.
 * Shared by the interactive and non-interactive paths (single renderer, no duplication).
 */
export function renderCatalog(
  analysis: AnalysisData,
  opts?: { selected?: Set<string>; prdHits?: Record<string, string> },
): string {
  const caps = analysis.capabilities;
  const selected = opts?.selected;
  const prdHits = opts?.prdHits ?? {};
  const idWidth = Math.min(caps.reduce((m, c) => Math.max(m, c.id.length), 8), 34);

  const domains: string[] = [];
  for (const c of caps) if (!domains.includes(c.domain)) domains.push(c.domain);

  const lines: string[] = [];
  lines.push(`${bold(cyan("curate"))} · ${bold(analysis.app.name)} — choose which capabilities become MCP tools`);
  lines.push(`${caps.length} capabilities · ${domains.length} domains · app: ${analysis.app.name}`);
  lines.push(dim("─".repeat(72)));

  for (const domain of domains) {
    const dcaps = caps.filter((c) => c.domain === domain);
    lines.push(`  ${bold(cyan(domain))} · ${dcaps.length}`);
    for (const c of dcaps) {
      const check = selected ? (selected.has(c.id) ? green("[x]") : dim("[ ]")) : "   ";
      const id = c.id.padEnd(idWidth);
      const act = `${c.action} ${c.object}`.slice(0, 26).padEnd(26);
      const safety = c.safetyLevel.padEnd(20);
      const params = `${(c.params ?? []).length}p`.padStart(3);
      const src = dim(shortSource(c.sourceRef));
      const prd = prdHits[c.id] ? ` ${green("★prd")}` : "";
      lines.push(`    ${check} ${id} ${dim(act)}  ${safety} ${params}  ${src}${prd}`);
    }
  }
  return lines.join("\n");
}

// ── interactive selector (TTY-only; @clack/prompts lazy-loaded, degrades gracefully) ──
async function interactiveSelect(analysis: AnalysisData): Promise<string[] | null> {
  let clack: typeof import("@clack/prompts");
  try {
    clack = await import("@clack/prompts");
  } catch {
    return null; // dependency unavailable → caller falls back to non-interactive instructions
  }
  clack.intro(`${bold("curate")} · ${analysis.app.name} — ${analysis.capabilities.length} capabilities`);
  const options = analysis.capabilities.map((c) => ({
    value: c.id,
    label: c.id,
    hint: `[${c.domain}] ${c.action} ${c.object} · ${c.safetyLevel}`,
  }));
  const result = await clack.multiselect({
    message: "space = toggle · enter = confirm (pick ≥1)",
    options,
    initialValues: [],
  });
  if (clack.isCancel(result)) {
    clack.cancel("cancelled — no selection written");
    return [];
  }
  return (result as readonly string[]).slice();
}

// ── command ─────────────────────────────────────────────────────────────────────────────
export async function curateCommand(args: string[]): Promise<void> {
  const positional = args.filter((a) => !a.startsWith("--"));
  const analysisPath = positional[0];
  const selectedFlag = args.indexOf("--selected");
  const allFlag = args.indexOf("--all");
  const prdFlag = args.indexOf("--prd");
  const outputFlag = args.indexOf("--output");

  if (!analysisPath) {
    throw new Error(
      "Usage: mcp-pipeline curate <analysis.json> [--selected <id,id,...>] [--all] [--prd <prd.md>] [--output <selection.json>]",
    );
  }

  const analysis = JSON.parse(readFileSync(resolve(analysisPath), "utf-8")) as AnalysisData;
  if (!analysis.capabilities?.length) throw new Error("analysis has no capabilities — nothing to curate");
  const allIds = analysis.capabilities.map((c) => c.id);
  const known = new Set(allIds);

  const prdText = prdFlag !== -1 && args[prdFlag + 1] ? readFileSync(resolve(args[prdFlag + 1]), "utf-8") : undefined;
  const prdHits: Record<string, string> = {};
  if (prdText) for (const r of enumerateCandidates(analysis, prdText)) if (r.prdHit) prdHits[r.id] = r.prdHit!;

  // Resolve the selection — exactly one of: --all / --selected / interactive TTY. Never hang.
  let selectedIds: string[] | null = null;
  let interactive = false;
  if (allFlag !== -1) {
    selectedIds = allIds.slice();
  } else if (selectedFlag !== -1) {
    const raw = args[selectedFlag + 1];
    if (!raw) throw new Error("--selected requires a comma-separated id list");
    selectedIds = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const unknown = selectedIds.filter((id) => !known.has(id));
    if (unknown.length) {
      throw new Error(`--selected references unknown capability ids (not in analysis): ${unknown.join(", ")}`);
    }
  } else if (process.stdin.isTTY) {
    interactive = true;
    selectedIds = await interactiveSelect(analysis);
  }

  if (selectedIds === null) {
    // non-interactive with no selection flag — show the catalog, then a clear, actionable error.
    process.stdout.write(renderCatalog(analysis, { prdHits }) + "\n\n");
    throw new Error(
      "no selection provided in non-interactive mode. Pick one:\n" +
      "  • interactive (terminal):  mcp-pipeline curate <analysis.json>\n" +
      "  • explicit ids:            --selected <id,id,...>   (e.g. --selected audio_soundstage_read,audio_volume_read)\n" +
      "  • all capabilities:        --all\n" +
      "curate is mandatory before scaffold; it cannot be skipped.",
    );
  }
  if (selectedIds.length === 0) {
    throw new Error("no capabilities selected — selection.json not written. Re-run and select at least one.");
  }

  const selectedSet = new Set(selectedIds);
  const outPath = outputFlag !== -1 && args[outputFlag + 1]
    ? resolve(args[outputFlag + 1])
    : resolve(dirname(resolve(analysisPath)), "selection.json");
  const payload = {
    selected: selectedIds,
    appId: analysis.app.name,
    total: allIds.length,
    selectedCount: selectedIds.length,
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf-8");

  const appName = analysis.app.name;
  try {
    let state = readState(appName) ?? createInitialState(appName, resolve(analysisPath));
    state = updateStep(state, "curate", { status: "completed", output: outPath });
    writeState(state);
  } catch { /* state tracking is best-effort; selection.json is the source of truth */ }

  // The interactive path already rendered a selector UI; only the non-interactive path echoes the
  // catalog. Both paths print the final summary line.
  if (!interactive) {
    process.stdout.write(renderCatalog(analysis, { selected: selectedSet, prdHits }) + "\n\n");
  }
  process.stdout.write(`${bold("selection.json")} → ${outPath}\n`);
  process.stdout.write(`${green("✓")} ${selectedIds.length}/${allIds.length} capabilities selected`);
  const dropped = allIds.filter((id) => !selectedSet.has(id));
  if (dropped.length) process.stdout.write(` · ${dim(`${dropped.length} excluded`)}`);
  process.stdout.write("\n");
}
