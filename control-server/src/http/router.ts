import type { IncomingMessage, ServerResponse } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ProjectSummary, SourceIndex } from "@bridge/workbench-contracts";
import type { ControlServerConfig } from "../config.js";
import { readArtifacts } from "../artifacts/artifact-reader.js";
import { EventBus } from "../events/event-bus.js";
import { WorkspaceManager } from "../import/workspace-manager.js";
import { McpSessionManager } from "../mcp/session-manager.js";
import { CommandPolicy } from "../pipeline/command-policy.js";
import { PipelineRunner, type PipelineWorkspace } from "../pipeline/pipeline-runner.js";
import { ProcessRunner } from "../pipeline/process-runner.js";
import { scanProject } from "../scanner/project-scanner.js";
import { safeProjectId } from "../security/paths.js";

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }

const importSchema = z.object({
  projectName: z.string().min(1).max(120),
  files: z.array(z.object({ path: z.string().min(1), contentBase64: z.string() })),
  targetSchema: z.record(z.unknown()),
});
const confirmationSchema = z.object({ confirmed: z.boolean().optional(), typedConfirmation: z.string().optional() });

function allowCors(request: IncomingMessage, response: ServerResponse): void {
  const origin = request.headers.origin;
  if (origin && /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?$/.test(origin)) response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-allow-headers", "content-type,last-event-id");
  response.setHeader("access-control-allow-methods", "GET,POST,PUT,OPTIONS");
}

function send(response: ServerResponse, status: number, data?: unknown, error?: string): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(error ? { ok: false, error: { code: status === 404 ? "not_found" : "request_failed", message: error } } : { ok: true, data }));
}

async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const value of request) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    total += chunk.length;
    if (total > limit) throw new HttpError(413, `Request body exceeds ${limit} bytes`);
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw new HttpError(400, "Request body must be valid JSON"); }
}

export class WorkbenchRouter {
  readonly workspaces: WorkspaceManager;
  readonly events = new EventBus();
  readonly policy = new CommandPolicy();
  readonly processRunner = new ProcessRunner();
  readonly mcp = new McpSessionManager(this.policy, this.events);
  readonly projects = new Map<string, ProjectSummary>();
  readonly pipelines = new Map<string, PipelineRunner>();
  readonly ready: Promise<void>;

  constructor(readonly config: ControlServerConfig) {
    this.workspaces = new WorkspaceManager(config.runtimeRoot, config.importLimits);
    this.ready = this.workspaces.listProjects().then((projects) => {
      for (const project of projects) this.projects.set(project.id, project);
    });
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    allowCors(request, response);
    if (request.method === "OPTIONS") { response.statusCode = 204; response.end(); return; }
    const url = new URL(request.url ?? "/", `http://${this.config.host}`);
    try {
      await this.ready;
      if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { host: this.config.host, version: "0.1.0" });
      if (request.method === "POST" && url.pathname === "/api/projects") {
        const input = importSchema.parse(await readJson(request, this.config.maxRequestBytes));
        const project = await this.workspaces.importProject(input);
        this.projects.set(project.id, project);
        this.events.publish(project.id, "project", { action: "imported", name: project.name });
        return send(response, 201, project);
      }
      if (request.method === "GET" && url.pathname === "/api/events") return this.streamEvents(request, response, url);

      const match = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(.*))?$/);
      if (!match) throw new HttpError(404, "Route not found");
      const project = this.project(decodeURIComponent(match[1]!));
      const tail = match[2] ?? "";
      if (request.method === "GET" && tail === "") return send(response, 200, project);
      if (request.method === "GET" && tail === "source") return send(response, 200, await this.sourceIndex(project));
      if (request.method === "GET" && tail === "artifacts") return send(response, 200, await readArtifacts(project.root, safeProjectId(project.name)));
      if (request.method === "PUT" && tail === "selection") {
        const input = z.object({ selected: z.array(z.string()) }).parse(await readJson(request, this.config.maxRequestBytes));
        const stateRoot = join(project.root, ".mcp-pipeline", safeProjectId(project.name));
        const analysis = JSON.parse(await readFile(join(stateRoot, "analysis.json"), "utf8")) as { capabilities?: { id?: unknown }[] };
        const known = new Set((Array.isArray(analysis.capabilities) ? analysis.capabilities : []).map((capability) => String(capability.id)));
        const unknown = [...new Set(input.selected)].filter((id) => !known.has(id));
        if (unknown.length) throw new HttpError(400, `Unknown capability selection: ${unknown.join(", ")}`);
        await mkdir(stateRoot, { recursive: true });
        const selected = [...new Set(input.selected)].sort();
        await writeFile(join(stateRoot, "selection.json"), `${JSON.stringify({ appId: safeProjectId(project.name), selected, selectedCount: selected.length }, null, 2)}\n`);
        await this.pipeline(project).recordPassed(await this.pipelineWorkspace(project), "curate");
        this.events.publish(project.id, "artifact", { name: "selection.json" });
        return send(response, 200, { selected });
      }
      const stageMatch = tail.match(/^stages\/([^/]+)$/);
      if (request.method === "POST" && stageMatch) {
        const confirmation = confirmationSchema.parse(await readJson(request, this.config.maxRequestBytes));
        const operation = stageMatch[1] as Parameters<PipelineRunner["runStage"]>[1];
        const result = await this.pipeline(project).runStage(await this.pipelineWorkspace(project), operation, confirmation);
        return send(response, 200, result);
      }
      if (tail === "mcp" && request.method === "GET") return send(response, 200, this.mcp.get(project.id) ?? { state: "stopped", tools: [], calls: [] });
      if (tail === "mcp/start" && request.method === "POST") {
        const input = z.object({ mode: z.enum(["mock", "real"]) }).merge(confirmationSchema).parse(await readJson(request, this.config.maxRequestBytes));
        if (input.mode === "real") this.pipeline(project).assertRealMcpReady();
        const generated = join(project.root, `mcp-${safeProjectId(project.name)}`);
        return send(response, 200, await this.mcp.start({ projectId: project.id, projectName: project.name, root: project.root }, { executable: process.execPath, args: [join(generated, "dist", "index.js")], cwd: generated }, input.mode, input));
      }
      if (tail === "mcp/stop" && request.method === "POST") {
        const input = confirmationSchema.parse(await readJson(request, this.config.maxRequestBytes));
        return send(response, 200, await this.mcp.stop(project.id, input, project.name));
      }
      if (tail === "mcp/call" && request.method === "POST") {
        const input = z.object({ toolName: z.string(), args: z.record(z.unknown()), mode: z.enum(["mock", "real"]) }).merge(confirmationSchema).parse(await readJson(request, this.config.maxRequestBytes));
        if (input.mode === "real") this.pipeline(project).assertRealMcpReady();
        return send(response, 200, await this.mcp.call({ projectId: project.id, projectName: project.name, root: project.root }, input.toolName, input.args, input.mode, input));
      }
      throw new HttpError(404, "Route not found");
    } catch (error) {
      if (response.headersSent) { response.end(); return; }
      const status = error instanceof HttpError ? error.status : error instanceof z.ZodError ? 400 : /not found|does not exist/i.test(String(error)) ? 404 : 400;
      send(response, status, undefined, error instanceof Error ? error.message : String(error));
    }
  }

  private project(id: string): ProjectSummary {
    const project = this.projects.get(id);
    if (!project) throw new HttpError(404, `Project not found: ${id}`);
    return project;
  }

  private async sourceIndex(project: ProjectSummary): Promise<SourceIndex> {
    const path = join(project.root, "source-index.json");
    try {
      const parsed = JSON.parse(await readFile(path, "utf8")) as SourceIndex;
      if (parsed.version === 1 && Array.isArray(parsed.nodes) && Array.isArray(parsed.edges) && Array.isArray(parsed.evidence)) return parsed;
    } catch { /* rebuild missing or invalid indexes from the isolated source */ }
    const index = await scanProject(join(project.root, "source"));
    await writeFile(path, `${JSON.stringify(index, null, 2)}\n`);
    return index;
  }

  private pipeline(project: ProjectSummary): PipelineRunner {
    let runner = this.pipelines.get(project.id);
    if (!runner) {
      runner = new PipelineRunner({ codexExecutable: this.config.codexExecutable, pipelineCliPath: join(this.config.repositoryRoot, "cli", "bin", "mcp-pipeline.js") }, this.processRunner, this.policy, this.events);
      runner.markPassed("import");
      this.pipelines.set(project.id, runner);
    }
    return runner;
  }

  private async pipelineWorkspace(project: ProjectSummary): Promise<PipelineWorkspace> {
    const app = safeProjectId(project.name);
    const state = join(project.root, ".mcp-pipeline", app);
    const generated = join(project.root, `mcp-${app}`);
    const sourceRoot = join(project.root, "source");
    const scan = await this.sourceIndex(project);
    const proxyPaths = scan.nodes
      .filter((node) => node.kind === "file" && /(?:proxy|service|client|controller|manager|\.aidl$)/i.test(node.path) && /\.(?:ts|tsx|js|jsx|kt|java|aidl)$/i.test(node.path))
      .slice(0, 200)
      .map((node) => join(sourceRoot, node.path));
    return { projectId: project.id, projectName: project.name, root: project.root, sourceRoot, targetSchemaPath: project.targetSchemaPath, analysisPath: join(state, "analysis.json"), selectionPath: join(state, "selection.json"), generatedRoot: generated, rpcConfigPath: join(generated, "rpc", "config.json"), proxyPaths };
  }

  private streamEvents(request: IncomingMessage, response: ServerResponse, url: URL): void {
    response.statusCode = 200;
    response.setHeader("content-type", "text/event-stream");
    response.setHeader("cache-control", "no-cache");
    response.setHeader("connection", "keep-alive");
    response.flushHeaders();
    const projectId = url.searchParams.get("projectId");
    const after = Number(request.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0);
    const write = (event: ReturnType<EventBus["publish"]>) => {
      if (projectId && event.projectId !== projectId) return;
      response.write(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    for (const event of this.events.replayAfter(Number.isFinite(after) ? after : 0)) write(event);
    const unsubscribe = this.events.subscribe(write);
    const heartbeat = setInterval(() => response.write(": heartbeat\n\n"), 15_000);
    heartbeat.unref();
    request.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  }
}
