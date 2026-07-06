import type { SourceIndex, WorkbenchEvent } from "@bridge/workbench-contracts";
import type { WorkbenchBridge } from "./types";

async function local<T>(operation: (bridge: WorkbenchBridge) => Promise<T>): Promise<T> {
  if (!window.bridge) throw new Error("Local Workbench bridge is unavailable. Start the Electron application.");
  return operation(window.bridge);
}

export const workbenchApi = {
  listProjects: () => local((bridge) => bridge.listProjects()),
  selectSourceDirectory: () => local((bridge) => bridge.selectSourceDirectory()),
  selectSchemaFile: () => local((bridge) => bridge.selectSchemaFile()),
  importProject: (body: { projectName: string; sourceDirectory: string; schemaPath: string }) => local((bridge) => bridge.importProject(body)),
  project: (id: string) => local((bridge) => bridge.getProject(id)),
  source: <T = SourceIndex>(id: string) => local((bridge) => bridge.getSourceIndex(id) as Promise<T>),
  artifacts: <T>(id: string) => local((bridge) => bridge.getArtifacts(id) as Promise<T>),
  selection: <T>(id: string, selected: readonly string[]) => local((bridge) => bridge.saveSelection(id, selected) as Promise<T>),
  stage: <T>(id: string, stage: string, confirmation: Record<string, unknown> = {}) => local((bridge) => bridge.runStage(id, stage, confirmation) as Promise<T>),
  pipeline: (id: string) => local((bridge) => bridge.getPipelineRun(id)),
  pipelineRetry: (id: string) => local((bridge) => bridge.retryPipeline(id)),
  pipelineCancel: (id: string) => local((bridge) => bridge.cancelPipeline(id)),
  resetProject: (id: string) => local((bridge) => bridge.resetProject(id)),
  mcp: <T>(id: string) => local((bridge) => bridge.getMcp(id) as Promise<T>),
  mcpStart: <T>(id: string, body: any) => local((bridge) => bridge.startMcp(id, body.mode, body) as Promise<T>),
  mcpStop: <T>(id: string, body: any) => local((bridge) => bridge.stopMcp(id, body) as Promise<T>),
  mcpCall: <T>(id: string, body: any) => local((bridge) => bridge.callMcp(id, body.toolName, body.args ?? {}, body.mode, body) as Promise<T>),
};

export function subscribeEvents(projectId: string, listener: (event: WorkbenchEvent) => void): Promise<() => void> {
  return local((bridge) => bridge.subscribeProjectEvents(projectId, listener));
}

export const launchParams = (): Promise<{ sourceDirectory: string }> => local((bridge) => bridge.getLaunchParams());
