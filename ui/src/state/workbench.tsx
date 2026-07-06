import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Capability, McpCallRecord, McpTool, PipelineAutomationRun, PipelineStageState, ProjectSummary, ProvenanceEdge, RpcEvidence, RpcFileProjection, RpcProjection, SourceEdge, SourceIndex, SourceNode, TargetProjection, ToolProjection, WorkbenchEvent } from "@bridge/workbench-contracts";
import { launchParams, workbenchApi, subscribeEvents } from "../bridge/client";

export interface Artifacts { capabilities: Capability[]; targets: TargetProjection[]; tools: ToolProjection[]; rpc: RpcProjection[]; rpcFiles: RpcFileProjection[]; edges: ProvenanceEdge[]; coverage: { targeted: number; matched: number; discovered: number; selected: number; projected: number; wired: number }; findings: string[]; stages: PipelineStageState[]; }
export interface McpState { state: string; mode?: "mock" | "real"; tools: McpTool[]; calls: McpCallRecord[]; error?: string; }
interface WorkbenchState {
  project?: ProjectSummary; source: SourceNode[]; sourceEdges: SourceEdge[]; sourceEvidence: RpcEvidence[]; sourceFindings: string[]; artifacts?: Artifacts; events: WorkbenchEvent[]; logs: string[]; mcp?: McpState; pipelineRun?: PipelineAutomationRun; connection: "checking" | "online" | "offline"; busy?: string; error?: string; initialSource: string;
  setProject(project: ProjectSummary): void; refresh(): Promise<void>; runStage(stage: string, confirmation?: Record<string, unknown>): Promise<void>; setError(error?: string): void;
  retryPipeline(): Promise<void>; cancelPipeline(): Promise<void>; resetProject(): Promise<void>;
  restoreSession: boolean; setRestoreSession(value: boolean): void;
}

const Context = createContext<WorkbenchState | undefined>(undefined);
export function WorkbenchProvider({ children }: PropsWithChildren) {
  const [project, setProject] = useState<ProjectSummary>(); const [source, setSource] = useState<SourceNode[]>([]); const [artifacts, setArtifacts] = useState<Artifacts>();
  const [sourceEdges, setSourceEdges] = useState<SourceEdge[]>([]); const [sourceEvidence, setSourceEvidence] = useState<RpcEvidence[]>([]); const [sourceFindings, setSourceFindings] = useState<string[]>([]);
  const [events, setEvents] = useState<WorkbenchEvent[]>([]); const [logs, setLogs] = useState<string[]>([]); const [mcp, setMcp] = useState<McpState>();
  const [pipelineRun, setPipelineRun] = useState<PipelineAutomationRun>();
  const [connection, setConnection] = useState<WorkbenchState["connection"]>("checking"); const [busy, setBusy] = useState<string>(); const [error, setError] = useState<string>();
  const [initialSource, setInitialSource] = useState("");
  const [restoreSession, setRestoreSessionFlag] = useState<boolean>(() => { try { return localStorage.getItem("bridge.restoreSession") === "1"; } catch { return false; } });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let sourceDirectory = "";
      try { sourceDirectory = (await launchParams()).sourceDirectory; } catch { /* bridge unavailable in non-Electron dev harness */ }
      if (cancelled) return;
      setInitialSource(sourceDirectory);
      const restore = localStorage.getItem("bridge.restoreSession") === "1";
      try {
        const projects = await workbenchApi.listProjects();
        if (cancelled) return;
        setConnection("online");
        // When launched with a source path, skip restoring the previous project so the
        // user lands on the pre-filled 导入 panel instead of a stale session.
        if (!sourceDirectory && restore && projects[0]) setProject(projects.at(-1));
      } catch { if (!cancelled) setConnection("offline"); }
    })();
    return () => { cancelled = true; };
  }, []);
  const refresh = useCallback(async () => {
    if (!project) return;
    const [scan, nextArtifacts, nextMcp, nextPipeline] = await Promise.all([workbenchApi.source<SourceIndex>(project.id), workbenchApi.artifacts<Artifacts>(project.id), workbenchApi.mcp<McpState>(project.id), workbenchApi.pipeline(project.id)]);
    setSource([...scan.nodes]); setSourceEdges([...scan.edges]); setSourceEvidence([...scan.evidence]); setSourceFindings([...scan.findings]); setArtifacts(nextArtifacts); setMcp(nextMcp); setPipelineRun(nextPipeline);
  }, [project]);
  useEffect(() => { if (!project) return; let unsubscribe: (() => void) | undefined; void refresh(); void subscribeEvents(project.id, (event) => { setEvents((all) => [...all, event].slice(-500)); if (event.type === "log") setLogs((all) => [...all, String(event.payload.text ?? "")].slice(-5000)); if (["artifact", "mcp", "stage", "pipeline"].includes(event.type)) void refresh(); }).then((value) => { unsubscribe = value; }, (reason) => setError(reason instanceof Error ? reason.message : String(reason))); return () => unsubscribe?.(); }, [project, refresh]);
  const runStage = useCallback(async (stage: string, confirmation: Record<string, unknown> = {}) => { if (!project) return; setBusy(stage); setError(undefined); try { await workbenchApi.stage(project.id, stage, confirmation); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(undefined); } }, [project, refresh]);
  const retryPipeline = useCallback(async () => { if (!project) return; setError(undefined); try { setPipelineRun(await workbenchApi.pipelineRetry(project.id)); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }, [project, refresh]);
  const cancelPipeline = useCallback(async () => { if (!project) return; setError(undefined); try { setPipelineRun(await workbenchApi.pipelineCancel(project.id)); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }, [project, refresh]);
  const resetProject = useCallback(async () => { if (!project) return; setBusy("reset"); setError(undefined); try { await workbenchApi.resetProject(project.id); await refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } finally { setBusy(undefined); } }, [project, refresh]);
  const setRestoreSession = useCallback((value: boolean) => { try { localStorage.setItem("bridge.restoreSession", value ? "1" : "0"); } catch { /* localStorage unavailable */ } setRestoreSessionFlag(value); }, []);
  const value = useMemo(() => ({ project, source, sourceEdges, sourceEvidence, sourceFindings, artifacts, events, logs, mcp, pipelineRun, connection, busy, error, initialSource, restoreSession, setProject, refresh, runStage, retryPipeline, cancelPipeline, resetProject, setRestoreSession, setError }), [project, source, sourceEdges, sourceEvidence, sourceFindings, artifacts, events, logs, mcp, pipelineRun, connection, busy, error, initialSource, restoreSession, refresh, runStage, retryPipeline, cancelPipeline, resetProject, setRestoreSession]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useWorkbench(): WorkbenchState { const value = useContext(Context); if (!value) throw new Error("WorkbenchProvider missing"); return value; }
