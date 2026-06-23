import type { AnalysisData, CapabilityDef, ParamDef } from "../types.js";
import { tsType, safeFieldName, buildMethodMap } from "./adapter-types.js";

function describeTool(action: string, object: string): string {
  const obj = object.replace(/_/g, " ");
  const parts = action.split("_");
  const verb = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
  const rest = parts.slice(1);

  if (rest.length === 0) return `${verb} ${obj}`;

  const prepositions = new Set(["to", "from", "by", "with", "for", "into", "onto", "at"]);
  if (prepositions.has(rest[0])) {
    return `${verb} ${rest.join(" ")} ${obj}`;
  }
  return `${verb} ${obj} ${rest.join(" ")}`;
}

export function generateToolHandlers(analysis: AnalysisData): Map<string, string> {
  const methodMap = buildMethodMap(analysis);
  const domainGroups = new Map<string, CapabilityDef[]>();

  for (const cap of analysis.capabilities) {
    if (!domainGroups.has(cap.domain)) {
      domainGroups.set(cap.domain, []);
    }
    domainGroups.get(cap.domain)!.push(cap);
  }

  const hasSafetySensitive = analysis.capabilities.some(
    (c) => c.safetyLevel !== "readonly" && c.safetyLevel !== "normal",
  );

  const result = new Map<string, string>();

  for (const [domain, caps] of domainGroups) {
    const lines: string[] = [];
    const registerFn = `register${domain.charAt(0).toUpperCase() + domain.slice(1)}Tools`;

    lines.push(`import { z } from "zod";`);
    lines.push(`import type { IAdapter } from "../adapters/types.js";`);
    lines.push(`import { formatSuccess, formatError } from "@im/mcp-server-framework";`);
    lines.push(`import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";`);
    lines.push(`import { safetyToAnnotations } from "./registry.js";`);
    if (hasSafetySensitive) {
      lines.push(`import type { SafetyLevel } from "@im/mcp-server-framework";`);
    }
    lines.push("");

    // Error code imports if available
    const allErrorImports: string[] = [];
    if (analysis.errorCodes) {
      for (const [key, domain_] of Object.entries(analysis.errorCodes)) {
        if (domain_.domainName === domain) {
          for (const codeName of Object.keys(domain_.codes)) {
            allErrorImports.push(`${key.toUpperCase()}_${codeName}`);
          }
        }
      }
    }
    if (allErrorImports.length > 0) {
      lines.push(`import { ${allErrorImports.join(", ")} } from "../types/errors.js";`);
    }

    function capErrorCode(cap: CapabilityDef): string {
      if (!analysis.errorCodes) return "1000";
      for (const [key, domain_2] of Object.entries(analysis.errorCodes)) {
        if (domain_2.domainName !== domain) continue;
        for (const [codeName, code] of Object.entries(domain_2.codes)) {
          const errorCode = `${key.toUpperCase()}_${codeName}`;
          if (codeName.toLowerCase().includes(cap.action.split("_")[0]) ||
              cap.action.includes(codeName.split("_")[0].toLowerCase())) {
            return errorCode;
          }
        }
        return `${key.toUpperCase()}_${Object.keys(domain_2.codes)[0]}`;
      }
      return "1000";
    }

    const guardParams = hasSafetySensitive
      ? `, guard: (level: SafetyLevel, input: Record<string, unknown>) => Promise<void>, registry: Record<string, string>`
      : "";

    lines.push(`export function ${registerFn}(server: McpServer, adapter: IAdapter${guardParams}): void {`);
    lines.push("");

    for (const cap of caps) {
      const adapterMethod = methodMap.get(cap.id)!;
      const description = describeTool(cap.action, cap.object);

      // Build Zod schema from params
      const schemaEntries: string[] = [];
      if (cap.params) {
        for (const p of cap.params) {
          let zodType: string;
          if (p.enum) {
            zodType = `z.enum([${p.enum.map((v) => `"${v}"`).join(", ")}])`;
          } else if (p.type === "string") {
            zodType = "z.string()";
          } else if (p.type === "number") {
            zodType = "z.number()";
          } else if (p.type === "boolean") {
            zodType = "z.boolean()";
          } else {
            zodType = "z.unknown()";
          }
          if (p.optional) zodType += ".optional()";
          if (p.description) zodType += `.describe("${p.description}")`;
          schemaEntries.push(`${safeFieldName(p.name)}: ${zodType}`);
        }
      }

      const schema = schemaEntries.length > 0 ? `{\n      ${schemaEntries.join(",\n      ")}\n    }` : "{}";
      const args = (cap.params ?? []).map((p) => {
        const value = `input.${safeFieldName(p.name)}`;
        // If param is enum string but type is number, convert it
        if (p.enum && p.type === "number") {
          // For required params, just convert. For optional, handle undefined
          if (p.optional) {
            return `${value} === undefined ? undefined : Number(${value}) as number | undefined`;
          }
          return `Number(${value}) as ${tsType(p.type)}`;
        }
        return `${value} as ${tsType(p.type)}`;
      }).join(", ");

      lines.push("  server.registerTool(");
      lines.push(`    "${cap.id}",`);
      lines.push(`    {`);
      lines.push(`      description: "${description}",`);
      lines.push(`      inputSchema: ${schema},`);
      lines.push(`      annotations: safetyToAnnotations("${cap.safetyLevel}"),`);
      lines.push(`    },`);
      lines.push(`    async (input) => {`);
      if (hasSafetySensitive) {
        lines.push(`      const level = registry["${cap.id}"] as SafetyLevel;`);
        lines.push(`      await guard(level, input as Record<string, unknown>);`);
      }
      lines.push(`      try {`);
      lines.push(`        const result = await adapter.${adapterMethod}(${args});`);
      lines.push(`        return formatSuccess(result);`);
      const capErrCode = capErrorCode(cap);
      lines.push(`      } catch (error) {`);
      lines.push(`        if (error instanceof Error) {`);
      lines.push(`          return formatError(${capErrCode}, error.message, "${domain}");`);
      lines.push(`        }`);
      lines.push(`        return formatError(${capErrCode}, String(error), "${domain}");`);
      lines.push(`      }`);
      lines.push("    },");
      lines.push("  );");
      lines.push("");
      lines.push("");
    }

    lines.push("}");
    lines.push("");

    result.set(`src/tools/${domain}.ts`, lines.join("\n"));
  }

  return result;
}
