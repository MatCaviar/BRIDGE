import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
import type { AnalysisData } from "../types.js";
import { generateRegistryData } from "../generators/registry-data.js";

/**
 * registry — project analysis.json → registry.json (the on-car bridge executor's dispatch table).
 *
 *   mcp-pipeline registry <analysis.json> [--out <registry.json>]
 *
 * Reads the analysis (with each capability's `mechanism` + mechanism-specific fields) and writes the
 * registry the executor consumes. Push the output to the executor's filesDir/registry.json on-car.
 */
export async function registryCommand(args: string[]): Promise<void> {
  let analysisPath: string | undefined;
  let outPath = "registry.json";
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--out") outPath = args[++i]!;
    else if (!a.startsWith("--")) analysisPath = a;
  }
  if (!analysisPath) {
    throw new Error("Usage: mcp-pipeline registry <analysis.json> [--out <registry.json>]");
  }

  const analysis = JSON.parse(readFileSync(resolve(analysisPath), "utf-8")) as AnalysisData;
  const registry = generateRegistryData(analysis);
  const out = resolve(outPath);
  writeFileSync(out, JSON.stringify(registry, null, 2) + "\n", "utf-8");

  process.stdout.write(`registry: ${registry.tools.length} tools -> ${out}\n`);
  for (const t of registry.tools) {
    const detail = t.command || t.methodName || t.mode || "";
    process.stdout.write(`  ${t.id} [${t.mechanism}] ${detail}\n`);
  }
}
