import { Ajv } from "ajv";
import type { ErrorObject } from "ajv";
import { readFileSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";

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
  const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    const semanticErrors = validateSemantics(data);
    if (semanticErrors.length === 0) {
      return { valid: true, errors: [] };
    }
    return { valid: false, errors: semanticErrors };
  }

  const errors = (validate.errors ?? []).map((e: ErrorObject) => ({
    path: e.instancePath || "/",
    message: e.message ?? "Unknown validation error",
  }));

  return { valid: false, errors };
}

function validateSemantics(data: unknown): ValidationResult["errors"] {
  const errors: Array<{ readonly path: string; readonly message: string }> = [];
  const capabilities = (data as { capabilities?: unknown }).capabilities;
  if (!Array.isArray(capabilities)) return errors;

  const enumsTable = (data as { enums?: Record<string, { map?: Record<string, string> }> }).enums ?? {};

  const capabilityIds = new Set<string>();
  capabilities.forEach((capability, capIndex) => {
    if (!capability || typeof capability !== "object") return;
    const cap = capability as { id?: unknown; params?: unknown; safetyLevel?: unknown };
    if (typeof cap.id === "string") {
      if (capabilityIds.has(cap.id)) {
        errors.push({ path: `/capabilities/${capIndex}/id`, message: `duplicate capability id '${cap.id}'` });
      } else {
        capabilityIds.add(cap.id);
      }
    }

    if (!Array.isArray(cap.params)) return;
    const paramNames = new Set<string>();
    cap.params.forEach((param, paramIndex) => {
      if (!param || typeof param !== "object") return;
      const p = param as { name?: unknown; type?: unknown; enum?: unknown; minimum?: unknown; maximum?: unknown; examples?: unknown };
      if (typeof p.name === "string") {
        if (paramNames.has(p.name)) {
          errors.push({
            path: `/capabilities/${capIndex}/params/${paramIndex}/name`,
            message: `duplicate parameter name '${p.name}'`,
          });
        } else {
          paramNames.add(p.name);
        }
      }

      if (p.name === "confirmed" && cap.safetyLevel === "p_gear_and_confirm" && p.type !== "boolean") {
        errors.push({
          path: `/capabilities/${capIndex}/params/${paramIndex}/type`,
          message: "confirmed parameter must be boolean for p_gear_and_confirm tools",
        });
      }

      if (p.type === "number" && Array.isArray(p.enum)) {
        const invalid = p.enum.find((value) => typeof value !== "string" || value.trim() === "" || !Number.isFinite(Number(value)));
        if (invalid !== undefined) {
          errors.push({
            path: `/capabilities/${capIndex}/params/${paramIndex}/enum`,
            message: "number parameter enum values must be numeric strings",
          });
        }
      }

      if (p.type === "boolean" && Array.isArray(p.enum)) {
        const invalid = p.enum.find((value) => value !== "true" && value !== "false");
        if (invalid !== undefined) {
          errors.push({
            path: `/capabilities/${capIndex}/params/${paramIndex}/enum`,
            message: "boolean parameter enum values must be 'true' or 'false'",
          });
        }
      }

      if (p.type === "number") {
        if (p.minimum !== undefined && typeof p.minimum !== "number") {
          errors.push({ path: `/capabilities/${capIndex}/params/${paramIndex}/minimum`, message: "minimum must be a number" });
        }
        if (p.maximum !== undefined && typeof p.maximum !== "number") {
          errors.push({ path: `/capabilities/${capIndex}/params/${paramIndex}/maximum`, message: "maximum must be a number" });
        }
        if (typeof p.minimum === "number" && typeof p.maximum === "number" && p.minimum > p.maximum) {
          errors.push({ path: `/capabilities/${capIndex}/params/${paramIndex}/minimum`, message: "minimum cannot exceed maximum" });
        }
      }

      // enum grounding: if the param's type names an enum that carries a wireValue→name map,
      // every declared enum value must be a canonical wire value — catches hallucinated enums a
      // substring wire_check would never see.
      if (typeof p.type === "string" && enumsTable[p.type]?.map && Array.isArray(p.enum)) {
        const allowed = new Set(Object.keys(enumsTable[p.type]!.map!));
        const bogus = (p.enum as readonly unknown[]).filter((v) => typeof v === "string" && !allowed.has(v as string));
        if (bogus.length > 0) {
          errors.push({ path: `/capabilities/${capIndex}/params/${paramIndex}/enum`, message: `enum value(s) not in enums.${p.type}.map wire values: ${(bogus as string[]).join(", ")}` });
        }
      }
    });
  });

  return errors;
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
  try {
  } catch {}

  const result = validateAnalysis(data);

  if (result.valid) {
    process.stdout.write(`Valid: ${resolvedPath}\n`);
    return;
  }

  const errorMsg = result.errors.map((e) => `  ${e.path}: ${e.message}`).join("\n");
  throw new Error(`Invalid: ${resolvedPath}\n${errorMsg}`);
}
