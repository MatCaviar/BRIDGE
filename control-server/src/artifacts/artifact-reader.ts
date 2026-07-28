import type { Capability, PipelineStageState, ProvenanceEdge, RpcFileProjection, RpcProjection, ToolProjection } from "@bridge/workbench-contracts";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

interface ArtifactProjection {
  readonly capabilities: readonly Capability[];
  readonly tools: readonly ToolProjection[];
  readonly rpc: readonly RpcProjection[];
  readonly rpcFiles: readonly RpcFileProjection[];
  readonly edges: readonly ProvenanceEdge[];
  readonly coverage: { readonly discovered: number; readonly selected: number; readonly projected: number; readonly wired: number };
  readonly findings: readonly string[];
  readonly stages: readonly PipelineStageState[];
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
  const schema = await optionalJson(join(projectRoot, "tools-schema.json"), "tools schema", findings);
  const config = await optionalJson(join(projectRoot, `mcp-${appName}`, "rpc", "config.json"), "RPC config", findings);
  const stageState = await optionalJson(join(projectRoot, ".workbench", "stages.json"), "pipeline stages", findings);
  const selected = new Set<string>(Array.isArray(selection?.selected) ? selection.selected : []);
  const generatedRoot = join(projectRoot, `mcp-${appName}`);
  const built = await fileExists(join(generatedRoot, "dist", "index.js"));
  const rpc: RpcProjection[] = config && typeof config === "object"
    ? Object.entries(config).filter(([key]) => key !== "_deferred").map(([operation, spec]: [string, any]) => ({
      operation,
      type: spec?.type === "dbus" || spec?.type === "native" ? spec.type : "unknown",
      valid: spec?.type === "dbus" || spec?.type === "native",
    }))
    : [];
  const rpcSet = new Set(rpc.map((entry) => entry.operation));
  const deferredValues = config?._deferred && typeof config._deferred === "object" ? config._deferred as Record<string, unknown> : {};
  const deferred = new Set<string>(Object.keys(deferredValues));
  const blockedReason = (name: string): string | undefined => {
    if (!built) return "Build output is missing";
    if (deferred.has(name)) {
      const value = deferredValues[name];
      return typeof value === "string" ? value : value && typeof value === "object" && "reason" in value ? String((value as any).reason) : "RPC mapping is deferred";
    }
    if (!rpcSet.has(name)) return "RPC mapping is missing";
    return undefined;
  };
  const tools: ToolProjection[] = Array.isArray(schema?.tools) ? schema.tools.map((tool: any) => {
    const name = String(tool.name);
    const mockExecutable = built;
    const reason = blockedReason(name);
    const realExecutable = mockExecutable && !reason;
    return {
      name,
      description: String(tool.description ?? ""),
      inputSchema: tool.inputSchema && typeof tool.inputSchema === "object" ? tool.inputSchema : {},
      executable: realExecutable,
      mockExecutable,
      realExecutable,
      blockedReason: reason,
    };
  }) : [];
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
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
    executable: toolMap.get(String(cap.id))?.realExecutable ?? false,
    mockExecutable: toolMap.get(String(cap.id))?.mockExecutable ?? false,
    realExecutable: toolMap.get(String(cap.id))?.realExecutable ?? false,
    blockedReason: toolMap.get(String(cap.id))?.blockedReason ?? (!toolMap.has(String(cap.id)) ? "MCP tool is not generated" : undefined),
    findings: [],
  }));
  // Imported schemas describe output shape and may contain examples. They are
  // never a target catalog; candidates and coverage originate only in source.
  const edges: ProvenanceEdge[] = [];
  for (const cap of capabilities) {
    edges.push({ from: `source:${cap.sourceRef}`, to: `capability:${cap.id}`, relation: "declares" });
    if (cap.selected) edges.push({ from: `capability:${cap.id}`, to: `selection:${cap.id}`, relation: "selects" });
    if (toolMap.has(cap.id)) edges.push({ from: `selection:${cap.id}`, to: `tool:${cap.id}`, relation: "projects" });
    if (rpcSet.has(cap.id)) edges.push({ from: `tool:${cap.id}`, to: `rpc:${cap.id}`, relation: "wires" });
  }
  // Surface detected problems into findings (the 发现 tab) so the user sees what went wrong across
  // the pipeline without grepping logs: a missing build, deferred RPC mappings, blocked tools, and
  // low-confidence (partial/broken) capabilities.
  if (!built) findings.push("build 产物 dist/index.js 缺失 — 工具不可执行");
  if (deferred.size > 0) {
    const shown = [...deferred].slice(0, 20).join(", ");
    findings.push(`${deferred.size} 个操作被 deferred(未生成 RPC 映射): ${shown}${deferred.size > 20 ? ` …共 ${deferred.size}` : ""}`);
  }
  for (const tool of tools) if (tool.blockedReason) findings.push(`工具 ${tool.name} 不可执行: ${tool.blockedReason}`);
  for (const cap of rawCapabilities) {
    const status = cap && typeof cap === "object" && "status" in cap ? String((cap as Record<string, unknown>).status) : "";
    if (status === "partial" || status === "broken") findings.push(`能力 ${String((cap as Record<string, unknown>).id ?? "?")} 状态为 ${status}`);
  }
  const rpcFiles = await readRpcFiles(generatedRoot, findings);
  return {
    capabilities,
    tools,
    rpc,
    rpcFiles,
    edges,
    coverage: {
      discovered: capabilities.length,
      selected: capabilities.filter((cap) => cap.selected).length,
      projected: capabilities.filter((cap) => toolMap.has(cap.id)).length,
      wired: capabilities.filter((cap) => rpcSet.has(cap.id)).length,
    },
    findings,
    stages: stageState?.stages && typeof stageState.stages === "object" ? Object.values(stageState.stages) as PipelineStageState[] : [],
  };
}

async function fileExists(path: string): Promise<boolean> {
  try { return (await stat(path)).isFile(); } catch { return false; }
}

/** Read the generated RPC source files (readable TypeScript under src/rpc, compiled JavaScript
 *  under dist/rpc) so the 机器可读产物 → RPC tab can display what was actually generated. Skips
 *  type declarations and source maps. Each file's content is capped at 256 KiB. A missing rpc
 *  directory is silent — the project may not have generated one yet. */
async function readRpcFiles(generatedRoot: string, findings: string[]): Promise<RpcFileProjection[]> {
  const out: RpcFileProjection[] = [];
  const groups: readonly { kind: "src" | "dist"; dir: string }[] = [
    { kind: "src", dir: join(generatedRoot, "src", "rpc") },
    { kind: "dist", dir: join(generatedRoot, "dist", "rpc") },
  ];
  const cap = 256 * 1024;
  for (const { kind, dir } of groups) {
    let names: string[];
    try { names = await readdir(dir); } catch { continue; }
    for (const name of names.sort()) {
      const keep = kind === "src" ? (name.endsWith(".ts") && !name.endsWith(".d.ts")) : name.endsWith(".js");
      if (!keep) continue;
      try {
        const content = await readFile(join(dir, name), "utf8");
        if (content.length > cap) findings.push(`rpc 文件 ${kind}/${name} 超过 256 KiB，已截断`);
        out.push({ name, kind, bytes: content.length, content: content.length > cap ? content.slice(0, cap) : content });
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") findings.push(`rpc 文件 ${kind}/${name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return out;
}
