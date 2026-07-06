import type { PipelineAutomationRun, ProjectSummary, SourceIndex, WorkbenchEvent } from "@bridge/workbench-contracts";

export interface WorkbenchBridge {
  selectSourceDirectory(): Promise<string | undefined>;
  selectSchemaFile(): Promise<string | undefined>;
  importProject(request: { projectName: string; sourceDirectory: string; schemaPath: string }): Promise<ProjectSummary>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ProjectSummary>;
  getSourceIndex(id: string): Promise<SourceIndex>;
  getArtifacts(id: string): Promise<unknown>;
  saveSelection(id: string, selected: readonly string[]): Promise<unknown>;
  runStage(id: string, stage: string, confirmation?: Record<string, unknown>): Promise<unknown>;
  getPipelineRun(id: string): Promise<PipelineAutomationRun | undefined>;
  retryPipeline(id: string): Promise<PipelineAutomationRun>;
  cancelPipeline(id: string): Promise<PipelineAutomationRun>;
  resetProject(id: string): Promise<void>;
  getMcp(id: string): Promise<unknown>;
  startMcp(id: string, mode: "mock" | "real", confirmation?: Record<string, unknown>): Promise<unknown>;
  stopMcp(id: string, confirmation?: Record<string, unknown>): Promise<unknown>;
  callMcp(id: string, toolName: string, args: Record<string, unknown>, mode: "mock" | "real", confirmation?: Record<string, unknown>): Promise<unknown>;
  subscribeProjectEvents(projectId: string, listener: (event: WorkbenchEvent) => void): Promise<() => void>;
}

declare global { interface Window { bridge?: WorkbenchBridge; } }
