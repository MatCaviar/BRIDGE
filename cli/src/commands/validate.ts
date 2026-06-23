import { Ajv } from "ajv";
import type { ErrorObject } from "ajv";
import { readFileSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<{ readonly path: string; readonly message: string }>;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = resolve(__dirname, "../../../schema/analysis.schema.json");

let cachedSchema: string | null = null;

function loadSchema(): string {
  if (cachedSchema !== null) return cachedSchema;
  cachedSchema = readFileSync(SCHEMA_PATH, "utf-8");
  return cachedSchema;
}

export function validateAnalysis(data: unknown): ValidationResult {
  const schemaText = loadSchema();
  const schema = JSON.parse(schemaText);
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((e: ErrorObject) => ({
    path: e.instancePath || "/",
    message: e.message ?? "Unknown validation error",
  }));

  return { valid: false, errors };
}

export async function validateCommand(args: string[]): Promise<void> {
  const filePath = args[0];

  if (!filePath) {
    throw new Error("Usage: mcp-pipeline validate <analysis.json>");
  }

  const resolvedPath = resolve(filePath);

  let data: unknown;
  try {
    const raw = readFileSync(resolvedPath, "utf-8");
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Error reading ${resolvedPath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const appName = (data as any)?.app?.name ?? basename(resolvedPath, ".json");
  let state = readState(appName) ?? createInitialState(appName, resolvedPath);
  try {
    state = updateStep(state, "validate", { status: "in_progress" });
    writeState(state);
  } catch {}

  const result = validateAnalysis(data);

  if (result.valid) {
    try {
      state = updateStep(state, "validate", { status: "completed" });
      writeState(state);
    } catch {}
    process.stdout.write(`Valid: ${resolvedPath}\n`);
    return;
  }

  const errorMsg = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
  try {
    state = updateStep(state, "validate", { status: "failed", error: errorMsg });
    writeState(state);
  } catch {}
  throw new Error(`Invalid: ${resolvedPath}\n${errorMsg}`);
}
