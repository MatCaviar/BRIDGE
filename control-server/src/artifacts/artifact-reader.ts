import type { Capability, ProvenanceEdge, RpcProjection, ToolProjection } from "@bridge/workbench-contracts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

interface ArtifactProjection {
  readonly capabilities: readonly Capability[];
  readonly tools: readonly ToolProjection[];
  readonly rpc: readonly RpcProjection[];
  readonly edges: readonly ProvenanceEdge[];
  readonly coverage: { readonly discovered: number; readonly selected: number; readonly projected: number; readonly wired: number };
  readonly findings: readonly string[];
}

async function optionalJson(path: string, label: string, findings: string[]): Promise<any | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    if (raw.length > 5 * 1024 * 1024) throw new Error("artifact exceeds 5 MiB");
    return JSON.parse(raw);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") findings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

export async function readArtifacts(projectRoot: string, appName: string): Promise<ArtifactProjection> {
  const findings: string[] = [];
  const stateRoot = join(projectRoot, ".mcp-pipeline", appName);
  const analysis = await optionalJson(join(stateRoot, "analysis.json"), "analysis", findings);
  const selection = await optionalJson(join(stateRoot, "selection.json"), "selection", findings);
  const schema = await optionalJson(join(stateRoot, "tools-schema.json"), "tools schema", findings);
  const config = await optionalJson(join(projectRoot, `mcp-${appName}`, "rpc", "config.json"), "RPC config", findings);
  const selected = new Set<string>(Array.isArray(selection?.selected) ? selection.selected : []);
  const tools: ToolProjection[] = Array.isArray(schema?.tools) ? schema.tools.map((tool: any) => ({
    name: String(tool.name),
    description: String(tool.description ?? ""),
    inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : {},
    executable: tool.executable !== false,
  })) : [];
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const rpc: RpcProjection[] = config && typeof config === "object"
    ? Object.entries(config).filter(([key]) => key !== "_deferred").map(([operation, spec]: [string, any]) => ({
      operation,
      type: spec?.type === "dbus" || spec?.type === "native" ? spec.type : "unknown",
      valid: spec?.type === "dbus" || spec?.type === "native",
    }))
    : [];
  const rpcSet = new Set(rpc.map((entry) => entry.operation));
  const deferred = new Set<string>(config?._deferred && typeof config._deferred === "object" ? Object.keys(config._deferred) : []);
  const rawCapabilities = Array.isArray(analysis?.capabilities) ? analysis.capabilities : [];
  const capabilities: Capability[] = rawCapabilities.map((cap: any) => ({
    id: String(cap.id),
    domain: String(cap.domain ?? "unknown"),
    object: String(cap.object ?? "unknown"),
    action: String(cap.action ?? "unknown"),
    sourceRef: String(cap.sourceRef ?? ""),
    safetyLevel: String(cap.safetyLevel ?? "unknown"),
    sdkCalls: Array.isArray(cap.sdkCalls) ? cap.sdkCalls.map(String) : [],
    params: Array.isArray(cap.params) ? cap.params : [],
    returns: cap.returns && typeof cap.returns === "object" ? cap.returns : undefined,
    selected: selected.size === 0 ? true : selected.has(String(cap.id)),
    executable: toolMap.get(String(cap.id))?.executable ?? (rpcSet.has(String(cap.id)) && !deferred.has(String(cap.id))),
    findings: [],
  }));
  const edges: ProvenanceEdge[] = [];
  for (const cap of capabilities) {
    edges.push({ from: `source:${cap.sourceRef}`, to: `capability:${cap.id}`, relation: "declares" });
    if (cap.selected) edges.push({ from: `capability:${cap.id}`, to: `selection:${cap.id}`, relation: "selects" });
    if (toolMap.has(cap.id)) edges.push({ from: `selection:${cap.id}`, to: `tool:${cap.id}`, relation: "projects" });
    if (rpcSet.has(cap.id)) edges.push({ from: `tool:${cap.id}`, to: `rpc:${cap.id}`, relation: "wires" });
  }
  return {
    capabilities,
    tools,
    rpc,
    edges,
    coverage: {
      discovered: capabilities.length,
      selected: capabilities.filter((cap) => cap.selected).length,
      projected: capabilities.filter((cap) => toolMap.has(cap.id)).length,
      wired: capabilities.filter((cap) => rpcSet.has(cap.id)).length,
    },
    findings,
  };
}
