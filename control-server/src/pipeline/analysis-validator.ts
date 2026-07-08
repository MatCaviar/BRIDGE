import type { ErrorObject, ValidateFunction } from "ajv";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Compiled once and reused across projects. Built lazily (dynamic import + first-call schema load)
// so non-analyze pipeline stages — and the test suite's non-analyze paths — never pay the ajv/schema
// cost. This schema is the single source of truth shared with the CLI's `validate` command
// (cli/src/commands/validate.ts), so a violation caught here is exactly what scaffold would reject
// later, only caught right after the agent run with one self-healing retry instead of after curate.
let cachedValidate: ValidateFunction | undefined;

/** Resolve <plugin-root>/schema/analysis.schema.json without assuming a fixed number of parent
 *  directories. From control-server/dist/pipeline/analysis-validator.js the schema is three dirs up
 *  in the dev layout (control-server -> plugin root), but when this package is consumed via the
 *  installed workbench's node_modules copy (<plugin-root>/node_modules/@bridge/control-server/), the
 *  same `../../../schema` lands at <plugin-root>/node_modules/@bridge/schema - which does not exist
 *  (ENOENT, the analyze-stage crash). Walk up until the file is found; this is correct for dev, the
 *  installed copy, and vitest (src/pipeline). Falls back to the original 3-up guess so a missing
 *  schema still surfaces a recognizable path in the error. */
function resolveAnalysisSchemaPath(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, "schema", "analysis.schema.json");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "schema", "analysis.schema.json");
}

async function loadAnalysisValidator(): Promise<ValidateFunction> {
  if (cachedValidate) return cachedValidate;
  const { Ajv } = await import("ajv");
  const schemaPath = resolveAnalysisSchemaPath();
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
  cachedValidate = ajv.compile(schema);
  return cachedValidate;
}

export type AnalysisValidation = { ok: true } | { ok: false; retryable: boolean; errors: string };

/** Validate analysis.json against the analysis schema.
 *  - `{ ok: true }` when valid.
 *  - `{ ok: false, retryable: false }` for a missing or unparseable file: the agent produced nothing
 *    usable, which a correction pass cannot fix, so the caller fails immediately (no retry).
 *  - `{ ok: false, retryable: true }` for parseable JSON that violates the schema: a genuine schema
 *    mistake the self-healing retry can address, with a formatted violation list to feed back. */
export async function validateAnalysis(analysisPath: string): Promise<AnalysisValidation> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(analysisPath, "utf8"));
  } catch (error) {
    return { ok: false, retryable: false, errors: `analysis.json is missing or not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const validate = await loadAnalysisValidator();
  if (validate(parsed)) return { ok: true };
  return { ok: false, retryable: true, errors: formatAnalysisErrors(validate.errors ?? []) };
}

/** Format ajv errors into a "JSON Pointer path → required constraint" list the agent can act on.
 *  Enum/pattern/additionalProperties params are expanded so the agent sees the allowed values /
 *  required pattern / offending field rather than ajv's generic "must be valid" message. Capped so a
 *  grossly invalid analysis does not overflow the retry prompt. */
export function formatAnalysisErrors(errors: readonly ErrorObject[]): string {
  const lines = errors.map((error) => {
    const at = error.instancePath || "(root)";
    const params = (error.params ?? {}) as Record<string, unknown>;
    let detail = error.message ?? error.keyword;
    if (error.keyword === "enum" && Array.isArray(params.allowedValues)) detail = `must be one of [${(params.allowedValues as readonly unknown[]).join(", ")}]`;
    else if (error.keyword === "pattern" && typeof params.pattern === "string") detail = `must match pattern ${params.pattern}`;
    else if (error.keyword === "additionalProperties" && typeof params.additionalProperty === "string") detail = `has unknown property "${params.additionalProperty}" (not allowed — remove or relocate it)`;
    else if (error.keyword === "required" && typeof params.missingProperty === "string") detail = `missing required property "${params.missingProperty}"`;
    else if (error.keyword === "type" && typeof params.type === "string") detail = `must be type ${params.type}`;
    return `  ${at}: ${detail}`;
  });
  const max = 40;
  if (lines.length > max) return `${lines.slice(0, max).join("\n")}\n  ...(${lines.length - max} more violations)`;
  return lines.join("\n");
}

/** The correction prompt for the self-healing retry: tells the agent its previous output failed
 *  schema validation, lists the exact violations, and instructs a targeted in-place fix rather than
 *  a fresh analysis. This is the concrete improvement the second attempt carries over the first
 *  (which ran blind) — the agent corrects its own output using the validator's feedback. */
export function analyzeCorrectionPrompt(analysisPath: string, errors: string): string {
  return `$mcp-analyze-fix Your previous analysis at ${analysisPath} FAILED JSON-schema validation. The validator reported these violations (JSON Pointer path → required constraint):
${errors}
Read ${analysisPath}, then fix EXACTLY these violations and overwrite ${analysisPath} with valid JSON. This is a correction pass, NOT a fresh analysis: preserve every field and capability that already passed, keep all ids / sourceRefs / descriptions / sdkCalls unchanged, and change only what is needed to satisfy the constraints above. Do not add or remove capabilities. Do not regenerate from source. Write ONLY the file ${analysisPath} by overwriting it. Do NOT run shell, bash, or PowerShell commands; do NOT copy, move, install, build, fetch, or use the network; do NOT touch node_modules or any file other than ${analysisPath}. Output the corrected file and stop.`;
}

