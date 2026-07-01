import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";
import { buildToolDefs, withExecutability } from "../generators/tool-schema.js";
import type { AnalysisData } from "../types.js";

/** Read _deferred keys from rpc/config.json (capabilities with no wire → executable:false). */
function readDeferred(configPath: string | undefined): readonly string[] {
  if (!configPath || !existsSync(configPath)) return [];
  try {
    const cfg = JSON.parse(readFileSync(configPath, "utf-8"));
    const def = cfg?._deferred;
    if (def && typeof def === "object" && !Array.isArray(def)) {
      return Object.keys(def as Record<string, unknown>);
    }
  } catch {
    // malformed config — treat as no deferred
  }
  return [];
}

/** Direct deterministic transform: analysis (+ config _deferred) → tools-schema.json.
 *  NO server spawn, NO build dependency. schema is a pure projection of analysis — producing it must
 *  never require compiling or running the server. This is the schema/runtime decoupling. */
export async function schemaPreviewCommand(args: string[]): Promise<void> {
  const positional = args.filter((a) => !a.startsWith("--"));
  const outputIdx = args.indexOf("--output");
  const analysisPath = positional[0];
  const configPath = positional[1];
  if (!analysisPath) {
    throw new Error(
      "Usage: mcp-pipeline schema_preview <analysis.json> [<rpc/config.json>] [--output <file.json>]\n" +
      "  analysis required; config optional (provides _deferred to mark tools executable:false).",
    );
  }
  const analysis = JSON.parse(readFileSync(resolve(analysisPath), "utf-8")) as AnalysisData;
  const deferred = readDeferred(configPath);
  const tools = withExecutability(buildToolDefs(analysis), deferred);
  const outPath =
    outputIdx !== -1 && args[outputIdx + 1]
      ? resolve(args[outputIdx + 1])
      : resolve(dirname(resolve(analysisPath)), "tools-schema.json");
  const server = analysis.app?.name ?? basename(analysisPath, ".json");
  const payload = { server, toolCount: tools.length, tools };
  writeFileSync(outPath, JSON.stringify(payload, null, 2));
  process.stdout.write(`Schema preview: ${tools.length} tools → ${outPath}\n`);
  for (const t of tools) {
    process.stdout.write(`  • ${t.name}${t.executable ? "" : " (deferred)"}\n`);
  }
}
