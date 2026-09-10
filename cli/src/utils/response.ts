import type { ToolContract } from "../types.js";
import type { InvokeResult } from "../commands/invoke.js";
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function normalizeResponse(result: InvokeResult, contract: ToolContract["response"] = {}) {
  const raw = object(result.data) ? result.data : {};
  const originalCode = raw[contract.codeField ?? "code"];
  const successCodes = contract.successCodes ?? [0];
  const hasCode = typeof originalCode === "number" || typeof originalCode === "string";
  const ok = result.ok && raw.ok !== false && raw.success !== false && (hasCode ? successCodes.includes(originalCode as string|number) : !contract.requireCode);
  const contradictedSuccess = hasCode && successCodes.includes(originalCode as string|number) && !ok;
  const code = contradictedSuccess ? 'BRIDGE_ERROR' : hasCode ? originalCode : ok ? successCodes[0] : contract.requireCode && result.ok ? "MISSING_RESPONSE_CODE" : "BRIDGE_ERROR";
  const message = raw[contract.messageField ?? "message"];
  const dataField = contract.dataField ?? "data";
  const body = {
    ...raw, code,
    message: contradictedSuccess ? result.error ?? 'Operation reported failure despite a success code' : typeof message === "string" ? message : ok ? "success" : result.error ?? `Operation failed (${code})`,
    data: Object.hasOwn(raw, dataField) ? raw[dataField] : result.data ?? {},
    extras: object(raw[contract.extrasField ?? "extras"]) ? raw[contract.extrasField ?? "extras"] : {},
    ...(contradictedSuccess ? {originalCode} : {}),
  };
  return { ok, body };
}

export function formatResponse(data: Record<string, unknown>, isError = false) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data, isError };
}
