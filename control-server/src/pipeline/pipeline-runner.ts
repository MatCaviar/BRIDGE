import type { OperationId, PipelineStageId, StageStatus } from "@bridge/workbench-contracts";
import { EventBus } from "../events/event-bus.js";
import { CommandPolicy } from "./command-policy.js";
import type { CommandSpec, ProcessResult } from "./process-runner.js";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { StageStore } from "./stage-store.js";

export interface PipelineRunnerConfig {
  readonly codexExecutable: string;
  readonly pipelineCliPath: string;
  readonly gatewayRoot?: string;
}

export interface PipelineWorkspace {
  readonly projectId: string;
  readonly projectName: string;
  readonly root: string;
  readonly sourceRoot: string;
  readonly targetSchemaPath: string;
  readonly analysisPath: string;
  readonly selectionPath: string;
  readonly generatedRoot: string;
  readonly rpcConfigPath: string;
  readonly proxyPaths: readonly string[];
}

export interface StageConfirmation { readonly confirmed?: boolean; readonly typedConfirmation?: string; }
export interface ProcessExecutor { run(spec: CommandSpec, signal?: AbortSignal, onLog?: (stream: "stdout" | "stderr", text: string) => void): Promise<ProcessResult>; }

const GATES: readonly PipelineStageId[] = ["validate_config", "wire_check", "test"];
const ANSI_ESCAPE = /\u001B(?:[@-_]|\[[0-?]*[ -/]*[@-~])/g;
const REQUIRED: Partial<Record<PipelineStageId, readonly PipelineStageId[]>> = {
  curate: ["analyze"], scaffold: ["curate"], generate: ["scaffold"],
  validate_config: ["generate"], wire_check: ["generate"], test: ["validate_config", "wire_check"],
  build: ["test"], register: ["build"], verify: ["register"], schema_preview: ["generate"], deploy: ["verify"],
};

export class PipelineRunner {
  readonly #states = new Map<PipelineStageId, StageStatus>();
  #hydratedRoot?: string;

  constructor(
    readonly config: PipelineRunnerConfig,
    readonly processRunner: ProcessExecutor,
    readonly policy: CommandPolicy,
    readonly events: EventBus,
    readonly stageStore = new StageStore(),
  ) {}

  async hydrate(workspace: PipelineWorkspace): Promise<void> {
    if (this.#hydratedRoot === workspace.root) return;
    const persisted = await this.stageStore.load(workspace.root);
    for (const [id, state] of Object.entries(persisted)) {
      if (state) this.#states.set(id as PipelineStageId, state.status);
    }
    this.#hydratedRoot = workspace.root;
  }

  markPassed(stage: PipelineStageId): void { this.#states.set(stage, "passed"); }
  markFailed(stage: PipelineStageId, error: string): void {
    this.#states.set(stage, "failed");
    this.events.publish("system", "stage", { stage, status: "failed", error });
  }
  async recordPassed(workspace: PipelineWorkspace, stage: PipelineStageId): Promise<void> {
    await this.hydrate(workspace);
    this.#states.set(stage, "passed");
    await this.stageStore.save(workspace.root, this.#states);
    this.events.publish(workspace.projectId, "stage", { stage, status: "passed" });
  }
  status(stage: PipelineStageId): StageStatus { return this.#states.get(stage) ?? "pending"; }

  assertRealMcpReady(): void {
    const failed = GATES.find((gate) => this.status(gate) === "failed");
    if (failed) throw new Error(`Real MCP mode is blocked by failed gate ${failed}`);
    for (const required of ["validate_config", "wire_check", "test", "build"] as const) {
      if (this.status(required) !== "passed") throw new Error(`Real MCP mode is blocked until ${required} passes`);
    }
  }

  async runStage(workspace: PipelineWorkspace, operation: Exclude<OperationId, `mcp_${string}` | "scan">, confirmation: StageConfirmation = {}, signal?: AbortSignal): Promise<ProcessResult> {
    const stage = operation as PipelineStageId;
    await this.hydrate(workspace);
    this.assertRunnable(stage);
    this.policy.authorize({ operation, projectId: workspace.projectId, projectName: workspace.projectName, workspaceRoot: workspace.root, cwd: workspace.root, ...confirmation });
    const release = this.policy.acquireMutation(workspace.projectId, operation);
    this.#states.set(stage, "running");
    await this.stageStore.save(workspace.root, this.#states);
    this.events.publish(workspace.projectId, "stage", { stage, status: "running" });
    try {
      const spec = this.commandFor(workspace, operation);
      const result = await this.processRunner.run(spec, signal, (stream, text) => this.events.publish(workspace.projectId, "log", { stage, stream, text }));
      const passed = result.exitCode === 0 && !result.timedOut && !result.aborted;
      if (!passed) {
        this.#states.set(stage, "failed");
        await this.stageStore.save(workspace.root, this.#states);
        this.events.publish(workspace.projectId, "stage", { stage, status: "failed", exitCode: result.exitCode, timedOut: result.timedOut, aborted: result.aborted });
        throw new Error(stageFailure(stage, result));
      }
      try {
        await assertStageOutput(stage, workspace);
      } catch (error) {
        this.#states.set(stage, "failed");
        await this.stageStore.save(workspace.root, this.#states);
        const message = error instanceof Error ? error.message : String(error);
        this.events.publish(workspace.projectId, "stage", { stage, status: "failed", error: message });
        throw error;
      }
      this.#states.set(stage, "passed");
      await this.stageStore.save(workspace.root, this.#states);
      this.events.publish(workspace.projectId, "stage", { stage, status: "passed", exitCode: result.exitCode, timedOut: result.timedOut, aborted: result.aborted });
      return result;
    } finally {
      release();
    }
  }

  private assertRunnable(stage: PipelineStageId): void {
    const failedGate = GATES.find((gate) => this.status(gate) === "failed");
    if (failedGate && ["build", "register", "verify", "deploy"].includes(stage)) throw new Error(`Stage ${stage} is blocked by failed gate ${failedGate}`);
    const missing = (REQUIRED[stage] ?? []).find((dependency) => this.status(dependency) !== "passed");
    if (missing) throw new Error(`Stage ${stage} is blocked until ${missing} passes`);
  }

  private commandFor(workspace: PipelineWorkspace, operation: Exclude<OperationId, `mcp_${string}` | "scan">): CommandSpec {
    if (operation === "analyze") return this.agentCommand(workspace, operation, `$mcp-analyze Analyze only ${workspace.sourceRoot} using deterministic source index ${join(workspace.root, "source-index.json")} and imported MCP output-format reference ${workspace.targetSchemaPath}. Use the imported schema only for descriptor shape, parameter encoding, and style. Never create a capability from a schema example or report an example as missing. Discover candidates exclusively from verified live source evidence. Treat declarations and RPC evidence in the index as navigation evidence, then verify every promoted capability against live source. Detect YunOS versus Android from source evidence. For Android, inspect Kotlin, Java, AIDL, manifests, and bundled SDK reference Markdown. Write machine-readable analysis to ${workspace.analysisPath}. Do not edit unrelated files or enable network access.`);
    if (operation === "generate") return this.agentCommand(workspace, operation, `$mcp-generate Generate only RPC configuration for ${workspace.generatedRoot} using ${workspace.sourceRoot} and ${workspace.analysisPath}. Write ${workspace.rpcConfigPath}. Do not edit unrelated files or enable network access.`);
    if (operation === "deploy") throw new Error("Deploy adapter is not configured");

    const args: string[] = [this.config.pipelineCliPath];
    switch (operation) {
      case "curate": args.push("curate", workspace.analysisPath, "--output", workspace.selectionPath); break;
      case "scaffold": args.push("scaffold", workspace.analysisPath, "--output", workspace.generatedRoot, "--selection", workspace.selectionPath); break;
      case "validate_config": args.push("validate_config", workspace.rpcConfigPath, "--analysis", workspace.analysisPath); break;
      case "wire_check": args.push("wire_check", workspace.rpcConfigPath, ...workspace.proxyPaths.flatMap((path) => ["--proxy", path])); break;
      case "test": case "build": args.push(operation, "--dir", workspace.generatedRoot); break;
      case "register":
        if (!this.config.gatewayRoot) throw new Error("Gateway root is not configured");
        args.push("register", "--dir", workspace.generatedRoot, "--gateway", this.config.gatewayRoot); break;
      case "verify": args.push("verify", "--dir", workspace.generatedRoot, ...(this.config.gatewayRoot ? ["--gateway", this.config.gatewayRoot] : [])); break;
      case "schema_preview": args.push("schema_preview", workspace.analysisPath, workspace.rpcConfigPath, "--output", `${workspace.root}/tools-schema.json`); break;
    }
    return { executable: process.execPath, args, cwd: workspace.root, operation, projectId: workspace.projectId };
  }

  private agentCommand(workspace: PipelineWorkspace, operation: "analyze" | "generate", prompt: string): CommandSpec {
    return { executable: this.config.codexExecutable, args: ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--ephemeral", "--color", "never", "--cd", workspace.root, prompt], cwd: workspace.root, operation, projectId: workspace.projectId };
  }
}

async function assertStageOutput(stage: PipelineStageId, workspace: PipelineWorkspace): Promise<void> {
  const required: Partial<Record<PipelineStageId, { path: string; json?: boolean }>> = {
    analyze: { path: workspace.analysisPath, json: true },
    curate: { path: workspace.selectionPath, json: true },
    scaffold: { path: join(workspace.generatedRoot, "package.json"), json: true },
    generate: { path: workspace.rpcConfigPath, json: true },
    build: { path: join(workspace.generatedRoot, "dist", "index.js") },
    schema_preview: { path: join(workspace.root, "tools-schema.json"), json: true },
  };
  const output = required[stage];
  if (!output) return;
  try {
    if (!(await stat(output.path)).isFile()) throw new Error("not a file");
    if (output.json) JSON.parse(await readFile(output.path, "utf8"));
  } catch {
    throw new Error(`Stage ${stage} output ${output.path.split(/[\\/]/).at(-1)} is missing or invalid`);
  }
}

function stageFailure(stage: PipelineStageId, result: ProcessResult): string {
  const reason = result.aborted
    ? "aborted"
    : result.timedOut
      ? "timed out"
      : `exited with code ${result.exitCode ?? "unknown"}`;
  const output = (result.stderr.trim() || result.stdout.trim())
    .replace(ANSI_ESCAPE, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12)
    .join("\n")
    .slice(-4000);
  const truncation = result.truncated ? " (log truncated)" : "";
  return `Stage ${stage} ${reason}${truncation}${output ? `:\n${output}` : ""}`;
}
