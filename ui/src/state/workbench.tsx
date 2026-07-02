import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Capability, McpCallRecord, McpTool, ProjectSummary, ProvenanceEdge, RpcProjection, SourceNode, TargetProjection, ToolProjection, WorkbenchEvent } from "@bridge/workbench-contracts";
import { workbenchApi } from "../api/client";
import { subscribeEvents } from "../api/events";

export interface Artifacts { capabilities: Capability[]; targets: TargetProjection[]; tools: ToolProjection[]; rpc: RpcProjection[]; edges: ProvenanceEdge[]; coverage: { targeted: number; matched: number; discovered: number; selected: number; projected: number; wired: number }; findings: string[]; }
export interface McpState { state: string; mode?: "mock" | "real"; tools: McpTool[]; calls: McpCallRecord[]; error?: string; }
interface WorkbenchState {
  project?: ProjectSummary; source: SourceNode[]; artifacts?: Artifacts; events: WorkbenchEvent[]; logs: string[]; mcp?: McpState; connection: "checking" | "online" | "offline"; busy?: string; error?: string;
  setProject(project: ProjectSummary): void; refresh(): Promise<void>; runStage(stage: string, confirmation?: Record<string, unknown>): Promise<void>; setError(error?: string): void;
}

const Context = createContext<WorkbenchState | undefined>(undefined);
export function WorkbenchProvider({ children }: PropsWithChildren) {
  const [project, setProject] = useState<ProjectSummary>(); const [source, setSource] = useState<SourceNode[]>([]); const [artifacts, setArtifacts] = useState<Artifacts>();
  const [events, setEvents] = useState<WorkbenchEvent[]>([]); const [logs, setLogs] = useState<string[]>([]); const [mcp, setMcp] = useState<McpState>();
  const [connection, setConnection] = useState<WorkbenchState["connection"]>("checking"); const [busy, setBusy] = useState<string>(); const [error, setError] = useState<string>();
  useEffect(() => { void workbenchApi.health().then(() => setConnection("online"), () => setConnection("offline")); }, []);
  const refresh = useCallback(async () => {
    if (!project) return;
    const [scan, nextArtifacts, nextMcp] = await Promise.all([workbenchApi.source<{ nodes: SourceNode[] }>(project.id), workbenchApi.artifacts<Artifacts>(project.id), workbenchApi.mcp<McpState>(project.id)]);
    setSource(scan.nodes); setArtifacts(nextArtifacts); setMcp(nextMcp);
  }, [project]);
  useEffect(() => { if (!project) return; void refresh(); return subscribeEvents(project.id, (event) => { setEvents((all) => [...all, event].slice(-500)); if (event.type === "log") setLogs((all) => [...all, String(event.payload.text ?? "")].slice(-5000)); if (event.type === "artifact" || event.type === "mcp" || event.type === "stage") void refresh(); }); }, [project, refresh]);
  const runStage = useCallback(async (stage: string, confirmation: Record<string, unknown> = {}) => { if (!project) return; setBusy(stage); setError(undefined); try { await workbenchApi.stage(project.id, stage, confirmation); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(undefined); } }, [project, refresh]);
  const value = useMemo(() => ({ project, source, artifacts, events, logs, mcp, connection, busy, error, setProject, refresh, runStage, setError }), [project, source, artifacts, events, logs, mcp, connection, busy, error, refresh, runStage]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkbench(): WorkbenchState { const value = useContext(Context); if (!value) throw new Error("WorkbenchProvider missing"); return value; }
