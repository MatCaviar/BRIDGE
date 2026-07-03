import type { OperationId, ProjectSummary, SourceIndex, WorkbenchEvent } from "@bridge/workbench-contracts";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ControlServerConfig } from "../config.js";
import { readArtifacts } from "../artifacts/artifact-reader.js";
import { EventBus } from "../events/event-bus.js";
import { parseTargetSchema, readLocalSource } from "../import/local-project-reader.js";
import { WorkspaceManager } from "../import/workspace-manager.js";
import { McpSessionManager } from "../mcp/session-manager.js";
import { CommandPolicy } from "../pipeline/command-policy.js";
import { PipelineRunner, type PipelineWorkspace, type StageConfirmation } from "../pipeline/pipeline-runner.js";
import { ProcessRunner } from "../pipeline/process-runner.js";
import { scanProject } from "../scanner/project-scanner.js";
import { safeProjectId } from "../security/paths.js";

export interface LocalImportRequest { readonly projectName: string; readonly sourceDirectory: string; readonly schemaPath: string; }

export class WorkbenchService {
  readonly workspaces: WorkspaceManager;
  readonly events = new EventBus();
  readonly policy = new CommandPolicy();
  readonly processRunner = new ProcessRunner();
  readonly mcp = new McpSessionManager(this.policy, this.events);
  readonly projects = new Map<string, ProjectSummary>();
  readonly pipelines = new Map<string, PipelineRunner>();
  readonly #ready: Promise<void>;

  constructor(readonly config: ControlServerConfig) {
    this.workspaces = new WorkspaceManager(config.runtimeRoot, config.importLimits);
    this.#ready = this.workspaces.listProjects().then((projects) => { for (const project of projects) this.projects.set(project.id, project); });
  }

  async ready(): Promise<void> { await this.#ready; }
  async listProjects(): Promise<ProjectSummary[]> { await this.ready(); return [...this.projects.values()].sort((a, b) => a.importedAt.localeCompare(b.importedAt)); }
  async getProject(id: string): Promise<ProjectSummary> { await this.ready(); const project = this.projects.get(id); if (!project) throw new Error(`Project not found: ${id}`); return project; }

  async importFromPaths(request: LocalImportRequest): Promise<ProjectSummary> {
    await this.ready();
    const [files, schemaRaw] = await Promise.all([readLocalSource(request.sourceDirectory), readFile(request.schemaPath, "utf8")]);
    const project = await this.workspaces.importProject({ projectName: request.projectName, files, targetSchema: parseTargetSchema(schemaRaw) });
    this.projects.set(project.id, project);
    this.events.publish(project.id, "project", { action: "imported", name: project.name });
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
    await mkdir(stateRoot, { recursive: true });
    await writeFile(join(stateRoot, "selection.json"), `${JSON.stringify({ appId: app, selected, selectedCount: selected.length }, null, 2)}\n`);
    await this.pipeline(project).recordPassed(await this.pipelineWorkspace(project), "curate");
    this.events.publish(project.id, "artifact", { name: "selection.json" });
    return { selected };
  }

  async runStage(projectId: string, operation: Exclude<OperationId, `mcp_${string}` | "scan">, confirmation: StageConfirmation = {}) {
    const project = await this.getProject(projectId); return this.pipeline(project).runStage(await this.pipelineWorkspace(project), operation, confirmation);
  }

  async getMcp(projectId: string) { await this.getProject(projectId); return this.mcp.get(projectId) ?? { state: "stopped", tools: [], calls: [] }; }
  async startMcp(projectId: string, mode: "mock" | "real", confirmation: StageConfirmation = {}) { const project = await this.getProject(projectId); if (mode === "real") this.pipeline(project).assertRealMcpReady(); const generated = join(project.root, `mcp-${safeProjectId(project.name)}`); return this.mcp.start({ projectId, projectName: project.name, root: project.root }, { executable: process.execPath, args: [join(generated, "dist", "index.js")], cwd: generated }, mode, confirmation); }
  async stopMcp(projectId: string, confirmation: StageConfirmation = {}) { const project = await this.getProject(projectId); return this.mcp.stop(projectId, confirmation, project.name); }
  async callMcp(projectId: string, toolName: string, args: Record<string, unknown>, mode: "mock" | "real", confirmation: StageConfirmation = {}) { const project = await this.getProject(projectId); if (mode === "real") this.pipeline(project).assertRealMcpReady(); return this.mcp.call({ projectId, projectName: project.name, root: project.root }, toolName, args, mode, confirmation); }

  subscribe(projectId: string | undefined, listener: (event: WorkbenchEvent) => void): () => void { return this.events.subscribe((event) => { if (!projectId || event.projectId === projectId) listener(event); }); }
  async shutdown(): Promise<void> { for (const project of this.projects.values()) if (this.mcp.get(project.id)?.state === "running") await this.mcp.stop(project.id, { confirmed: true }, project.name).catch(() => undefined); }

  private pipeline(project: ProjectSummary): PipelineRunner { let runner = this.pipelines.get(project.id); if (!runner) { runner = new PipelineRunner({ codexExecutable: this.config.codexExecutable, pipelineCliPath: join(this.config.repositoryRoot, "cli", "bin", "mcp-pipeline.js") }, this.processRunner, this.policy, this.events); runner.markPassed("import"); this.pipelines.set(project.id, runner); } return runner; }
  private async pipelineWorkspace(project: ProjectSummary): Promise<PipelineWorkspace> { const app = safeProjectId(project.name); const state = join(project.root, ".mcp-pipeline", app); const generated = join(project.root, `mcp-${app}`); const sourceRoot = join(project.root, "source"); const scan = await this.getSourceIndex(project.id); const proxyPaths = scan.nodes.filter((node) => node.kind === "file" && /(?:proxy|service|client|controller|manager|\.aidl$)/i.test(node.path) && /\.(?:ts|tsx|js|jsx|kt|java|aidl)$/i.test(node.path)).slice(0, 200).map((node) => join(sourceRoot, node.path)); return { projectId: project.id, projectName: project.name, root: project.root, sourceRoot, targetSchemaPath: project.targetSchemaPath, analysisPath: join(state, "analysis.json"), selectionPath: join(state, "selection.json"), generatedRoot: generated, rpcConfigPath: join(generated, "rpc", "config.json"), proxyPaths }; }
}
