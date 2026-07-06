import type { OperationId, PipelineAutomationRun, PipelineStageId, ProjectSummary, SourceIndex, WorkbenchEvent } from "@bridge/workbench-contracts";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { ControlServerConfig } from "../config.js";
import { readArtifacts } from "../artifacts/artifact-reader.js";
import { EventBus } from "../events/event-bus.js";
import { parseTargetSchema, readLocalSource } from "../import/local-project-reader.js";
import { WorkspaceManager } from "../import/workspace-manager.js";
import { McpSessionManager } from "../mcp/session-manager.js";
import { CommandPolicy } from "../pipeline/command-policy.js";
import { AutoPipelineCoordinator, type AutoPipelineContext, type AutomaticStageExecutor } from "../pipeline/auto-pipeline.js";
import { createAgentBackend, type AgentBackend } from "../pipeline/agent-backend.js";
import { PipelineRunner, type PipelineWorkspace, type ProcessExecutor, type StageConfirmation } from "../pipeline/pipeline-runner.js";
import { ProcessRunner } from "../pipeline/process-runner.js";
import { RunLog } from "../persistence/run-log.js";
import { scanProject } from "../scanner/project-scanner.js";
import { safeProjectId } from "../security/paths.js";

export interface LocalImportRequest { readonly projectName: string; readonly sourceDirectory: string; readonly schemaPath: string; }
type AutomationController = Pick<AutoPipelineCoordinator, "startAnalysis" | "continueAfterCurate" | "get" | "retry" | "cancel">;
export interface WorkbenchServiceDependencies {
  readonly processRunner?: ProcessExecutor;
  readonly automation?: AutomationController;
  readonly autoStartAnalysis?: boolean;
}

export class WorkbenchService {
  readonly workspaces: WorkspaceManager;
  readonly events = new EventBus();
  readonly policy = new CommandPolicy();
  readonly processRunner: ProcessExecutor;
  readonly agent: AgentBackend;
  readonly mcp = new McpSessionManager(this.policy, this.events);
  readonly automation: AutomationController;
  readonly autoStartAnalysis: boolean;
  readonly projects = new Map<string, ProjectSummary>();
  readonly pipelines = new Map<string, PipelineRunner>();
  readonly #runLogs = new Map<string, RunLog>();
  readonly #ready: Promise<void>;

  constructor(readonly config: ControlServerConfig, dependencies: WorkbenchServiceDependencies = {}) {
    this.processRunner = dependencies.processRunner ?? new ProcessRunner();
    this.agent = createAgentBackend(config.agentBackend, { codex: config.codexExecutable, claude: config.claudeExecutable });
    this.automation = dependencies.automation ?? new AutoPipelineCoordinator(this.events);
    this.autoStartAnalysis = dependencies.autoStartAnalysis ?? true;
    this.workspaces = new WorkspaceManager(config.runtimeRoot, config.importLimits);
    this.#ready = this.workspaces.listProjects().then((projects) => { for (const project of projects) this.projects.set(project.id, project); });
    this.events.subscribe((event) => {
      if (event.projectId === "system") return;
      const project = this.projects.get(event.projectId);
      if (project) this.#runLog(project).append(event);
    });
  }

  #runLog(project: ProjectSummary): RunLog {
    let log = this.#runLogs.get(project.id);
    if (!log) { log = new RunLog(project.root); this.#runLogs.set(project.id, log); }
    return log;
  }

  async ready(): Promise<void> { await this.#ready; }
  async listProjects(): Promise<ProjectSummary[]> { await this.ready(); return [...this.projects.values()].sort((a, b) => a.importedAt.localeCompare(b.importedAt)); }
  async getProject(id: string): Promise<ProjectSummary> { await this.ready(); const project = this.projects.get(id); if (!project) throw new Error(`Project not found: ${id}`); return project; }

  async importFromPaths(request: LocalImportRequest): Promise<ProjectSummary> {
    await this.ready();
    const [files, schemaRaw] = await Promise.all([readLocalSource(request.sourceDirectory), readFile(request.schemaPath, "utf8")]);
    // Persist the resolved absolute source path so the `deploy` stage can export the generated
    // artifact to its sibling later. resolve() is idempotent on an already-absolute path.
    const project = await this.workspaces.importProject({ projectName: request.projectName, files, targetSchema: parseTargetSchema(schemaRaw), originalSourcePath: resolve(request.sourceDirectory) });
    this.projects.set(project.id, project);
    this.events.publish(project.id, "project", { action: "imported", name: project.name });
    if (this.autoStartAnalysis) void this.automation.startAnalysis(this.autoContext(project), this.autoExecutor(project));
    return project;
  }

  async getSourceIndex(projectId: string): Promise<SourceIndex> {
    const project = await this.getProject(projectId);
    const path = join(project.root, "source-index.json");
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as SourceIndex;
      if (parsed.version === 1 && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && Array.isArray(parsed.evidence)) return parsed;
    } catch { /* rebuild below */ }
    const index = await scanProject(join(project.root, "source"));
    await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
    return index;
  }

  async getArtifacts(projectId: string): Promise<Awaited<ReturnType<typeof readArtifacts>>> { const project = await this.getProject(projectId); return readArtifacts(project.root, safeProjectId(project.name)); }

  async saveSelection(projectId: string, requested: readonly string[]): Promise<{ selected: string[] }> {
    const project = await this.getProject(projectId); const app = safeProjectId(project.name); const stateRoot = join(project.root, ".mcp-pipeline", app);
    const analysis = JSON.parse(await readFile(join(stateRoot, "analysis.json"), "utf8")) as { capabilities?: { id?: unknown }[] };
    const known = new Set((Array.isArray(analysis.capabilities) ? analysis.capabilities : []).map((capability) => String(capability.id)));
    const selected = [...new Set(requested)].sort(); const unknown = selected.filter((id) => !known.has(id));
    if (unknown.length) throw new Error(`Unknown capability selection: ${unknown.join(", ")}`);
    if (!selected.length) throw new Error("Select at least one source-backed capability before continuing");
    await mkdir(stateRoot, { recursive: true });
    await writeFile(join(stateRoot, "selection.json"), `${JSON.stringify({ appId: app, selected, selectedCount: selected.length }, null, 2)}\n`);
    await this.pipeline(project).recordPassed(await this.pipelineWorkspace(project), "curate");
    this.events.publish(project.id, "artifact", { name: "selection.json" });
    void this.automation.continueAfterCurate(this.autoContext(project), this.autoExecutor(project));
    return { selected };
  }

  async runStage(projectId: string, operation: Exclude<OperationId, `mcp_${string}` | "scan">, confirmation: StageConfirmation = {}, signal?: AbortSignal) {
    const project = await this.getProject(projectId); return this.pipeline(project).runStage(await this.pipelineWorkspace(project), operation, confirmation, signal);
  }

  async getPipelineRun(projectId: string): Promise<PipelineAutomationRun | undefined> { const project = await this.getProject(projectId); return this.automation.get(this.autoContext(project)); }
  async retryPipeline(projectId: string): Promise<PipelineAutomationRun> { const project = await this.getProject(projectId); return this.automation.retry(this.autoContext(project), this.autoExecutor(project)); }
  async cancelPipeline(projectId: string): Promise<PipelineAutomationRun> { const project = await this.getProject(projectId); return this.automation.cancel(this.autoContext(project)); }

  async resetProject(projectId: string): Promise<void> {
    await this.ready();
    const project = await this.getProject(projectId);
    const app = safeProjectId(project.name);
    // Stop any running MCP session and abort an in-flight pipeline before clearing state.
    if (this.mcp.get(project.id)?.state === "running") await this.mcp.stop(project.id, { confirmed: true }, project.name).catch(() => undefined);
    const run = await this.automation.get(this.autoContext(project));
    if (run?.status === "analyzing" || run?.status === "running") await this.automation.cancel(this.autoContext(project)).catch(() => undefined);
    // Drop the cached pipeline runner so a fresh one is built with only `import` marked passed.
    this.pipelines.delete(project.id);
    await this.#clearDerivedState(project.root, app);
    this.events.publish(project.id, "project", { action: "reset", name: project.name });
    if (this.autoStartAnalysis) void this.automation.startAnalysis(this.autoContext(project), this.autoExecutor(project));
  }

  /** Remove derived analysis/curate/pipeline state so the project can be re-run from scratch. Keeps imported source. */
  async #clearDerivedState(root: string, app: string): Promise<void> {
    const targets = [join(root, ".workbench"), join(root, ".mcp-pipeline", app), join(root, "tools-schema.json")];
    for (const target of targets) await rm(target, { recursive: true, force: true }).catch(() => undefined);
  }

  async getMcp(projectId: string) { await this.getProject(projectId); return this.mcp.get(projectId) ?? { state: "stopped", tools: [], calls: [] }; }
  async startMcp(projectId: string, mode: "mock" | "real", confirmation: StageConfirmation = {}) { const project = await this.getProject(projectId); if (mode === "real") this.pipeline(project).assertRealMcpReady(); const generated = join(project.root, `mcp-${safeProjectId(project.name)}`); return this.mcp.start({ projectId, projectName: project.name, root: project.root }, { executable: process.execPath, args: [join(generated, "dist", "index.js")], cwd: generated }, mode, confirmation); }
  async stopMcp(projectId: string, confirmation: StageConfirmation = {}) { const project = await this.getProject(projectId); return this.mcp.stop(projectId, confirmation, project.name); }
  async callMcp(projectId: string, toolName: string, args: Record<string, unknown>, mode: "mock" | "real", confirmation: StageConfirmation = {}) { const project = await this.getProject(projectId); if (mode === "real") this.pipeline(project).assertRealMcpReady(); return this.mcp.call({ projectId, projectName: project.name, root: project.root }, toolName, args, mode, confirmation); }

  subscribe(projectId: string | undefined, listener: (event: WorkbenchEvent) => void): () => void { return this.events.subscribe((event) => { if (!projectId || event.projectId === projectId) listener(event); }); }
  async shutdown(): Promise<void> {
    for (const project of this.projects.values()) {
      const run = await this.automation.get(this.autoContext(project));
      if (run?.status === "analyzing" || run?.status === "running") await this.automation.cancel(this.autoContext(project)).catch(() => undefined);
      if (this.mcp.get(project.id)?.state === "running") await this.mcp.stop(project.id, { confirmed: true }, project.name).catch(() => undefined);
    }
  }

  private pipeline(project: ProjectSummary): PipelineRunner { let runner = this.pipelines.get(project.id); if (!runner) { runner = new PipelineRunner({ agent: this.agent, pipelineCliPath: join(this.config.repositoryRoot, "cli", "bin", "mcp-pipeline.js") }, this.processRunner, this.policy, this.events); runner.markPassed("import"); this.pipelines.set(project.id, runner); } return runner; }
  private autoContext(project: ProjectSummary): AutoPipelineContext { return { projectId: project.id, root: project.root }; }
  private autoExecutor(project: ProjectSummary): AutomaticStageExecutor {
    return async (stage: PipelineStageId, confirmation, signal) => {
      if (stage === "import") throw new Error("Import is not an executable automatic stage");
      return this.runStage(project.id, stage as Exclude<OperationId, `mcp_${string}` | "scan">, confirmation, signal);
    };
  }
  private async pipelineWorkspace(project: ProjectSummary): Promise<PipelineWorkspace> { const app = safeProjectId(project.name); const state = join(project.root, ".mcp-pipeline", app); const generated = join(project.root, `mcp-${app}`); const sourceRoot = join(project.root, "source"); const scan = await this.getSourceIndex(project.id); const proxyPaths = scan.nodes.filter((node) => node.kind === "file" && /(?:proxy|service|client|controller|manager|\.aidl$)/i.test(node.path) && /\.(?:ts|tsx|js|jsx|kt|java|aidl)$/i.test(node.path)).slice(0, 200).map((node) => join(sourceRoot, node.path)); return { projectId: project.id, projectName: project.name, root: project.root, sourceRoot, targetSchemaPath: project.targetSchemaPath, analysisPath: join(state, "analysis.json"), selectionPath: join(state, "selection.json"), generatedRoot: generated, rpcConfigPath: join(generated, "rpc", "config.json"), proxyPaths, deployTarget: project.originalSourcePath ? join(dirname(project.originalSourcePath), `mcp-${app}`) : undefined }; }
}
