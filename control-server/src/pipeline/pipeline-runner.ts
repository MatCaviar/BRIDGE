import type { OperationId, PipelineStageId, StageStatus } from "@bridge/workbench-contracts";
import { EventBus } from "../events/event-bus.js";
import { CommandPolicy } from "./command-policy.js";
import type { CommandSpec, ProcessResult } from "./process-runner.js";

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
const REQUIRED: Partial<Record<PipelineStageId, readonly PipelineStageId[]>> = {
  curate: ["analyze"], scaffold: ["curate"], generate: ["scaffold"],
  validate_config: ["generate"], wire_check: ["generate"], test: ["validate_config", "wire_check"],
  build: ["test"], register: ["build"], verify: ["register"], schema_preview: ["generate"], deploy: ["verify"],
};

export class PipelineRunner {
  readonly #states = new Map<PipelineStageId, StageStatus>();

  constructor(
    readonly config: PipelineRunnerConfig,
    readonly processRunner: ProcessExecutor,
    readonly policy: CommandPolicy,
    readonly events: EventBus,
  ) {}

  markPassed(stage: PipelineStageId): void { this.#states.set(stage, "passed"); }
  markFailed(stage: PipelineStageId, error: string): void {
    this.#states.set(stage, "failed");
    this.events.publish("system", "stage", { stage, status: "failed", error });
  }
  status(stage: PipelineStageId): StageStatus { return this.#states.get(stage) ?? "pending"; }

  async runStage(workspace: PipelineWorkspace, operation: Exclude<OperationId, `mcp_${string}` | "scan">, confirmation: StageConfirmation = {}, signal?: AbortSignal): Promise<ProcessResult> {
    const stage = operation as PipelineStageId;
    this.assertRunnable(stage);
    this.policy.authorize({ operation, projectId: workspace.projectId, projectName: workspace.projectName, workspaceRoot: workspace.root, cwd: workspace.root, ...confirmation });
    const release = this.policy.acquireMutation(workspace.projectId, operation);
    this.#states.set(stage, "running");
    this.events.publish(workspace.projectId, "stage", { stage, status: "running" });
    try {
      const spec = this.commandFor(workspace, operation);
      const result = await this.processRunner.run(spec, signal, (stream, text) => this.events.publish(workspace.projectId, "log", { stage, stream, text }));
      const passed = result.exitCode === 0 && !result.timedOut && !result.aborted;
      this.#states.set(stage, passed ? "passed" : "failed");
      this.events.publish(workspace.projectId, "stage", { stage, status: passed ? "passed" : "failed", exitCode: result.exitCode, timedOut: result.timedOut, aborted: result.aborted });
      if (!passed) throw new Error(`Stage ${stage} failed`);
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
    if (operation === "analyze") return this.agentCommand(workspace, operation, `$mcp-analyze Analyze only ${workspace.sourceRoot} against target schema ${workspace.targetSchemaPath}. Write machine-readable analysis to ${workspace.analysisPath}. Do not edit unrelated files or enable network access.`);
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
    return { executable: this.config.codexExecutable, args: ["exec", "--sandbox", "workspace-write", "--cd", workspace.root, prompt], cwd: workspace.root, operation, projectId: workspace.projectId };
  }
}
