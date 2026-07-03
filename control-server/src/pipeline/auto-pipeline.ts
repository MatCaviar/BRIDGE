import { automaticPostCurateStages, type PipelineAutomationRun, type PipelineAutomationStatus, type PipelineStageId } from "@bridge/workbench-contracts";
import type { EventBus } from "../events/event-bus.js";
import { AutoRunStore } from "./auto-run-store.js";

export interface AutoPipelineContext { readonly projectId: string; readonly root: string; }
export type AutomaticStageExecutor = (stage: PipelineStageId, confirmation: { readonly confirmed?: boolean }, signal: AbortSignal) => Promise<unknown>;

interface ActiveRun { readonly controller: AbortController; }

export class AutoPipelineCoordinator {
  readonly #active = new Map<string, ActiveRun>();

  constructor(readonly events: EventBus, readonly store = new AutoRunStore()) {}

  get(context: AutoPipelineContext): Promise<PipelineAutomationRun | undefined> { return this.store.load(context.root); }

  startAnalysis(context: AutoPipelineContext, execute: AutomaticStageExecutor): Promise<PipelineAutomationRun> {
    return this.#execute(context, ["analyze"], "analyzing", "awaiting_curate", execute);
  }

  async continueAfterCurate(context: AutoPipelineContext, execute: AutomaticStageExecutor): Promise<PipelineAutomationRun> {
    const current = await this.get(context);
    if (current?.status !== "awaiting_curate") throw new Error("Pipeline is not awaiting Curate selection");
    return this.#execute(context, automaticPostCurateStages, "running", "mock_ready", execute);
  }

  async retry(context: AutoPipelineContext, execute: AutomaticStageExecutor): Promise<PipelineAutomationRun> {
    const current = await this.get(context);
    if (current?.status !== "failed" || !current.failedStage) throw new Error("Pipeline has no failed stage to retry");
    if (current.failedStage === "analyze") return this.startAnalysis(context, execute);
    const index = automaticPostCurateStages.indexOf(current.failedStage as typeof automaticPostCurateStages[number]);
    if (index < 0) throw new Error(`Stage ${current.failedStage} is not retryable automatically`);
    return this.#execute(context, automaticPostCurateStages.slice(index), "running", "mock_ready", execute, current.startedAt);
  }

  async cancel(context: AutoPipelineContext): Promise<PipelineAutomationRun> {
    this.#active.get(context.projectId)?.controller.abort();
    const current = await this.get(context);
    return this.#transition(context, {
      projectId: context.projectId,
      status: "cancelled",
      startedAt: current?.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  async #execute(
    context: AutoPipelineContext,
    stages: readonly PipelineStageId[],
    runningStatus: PipelineAutomationStatus,
    successStatus: PipelineAutomationStatus,
    execute: AutomaticStageExecutor,
    startedAt = new Date().toISOString(),
  ): Promise<PipelineAutomationRun> {
    if (this.#active.has(context.projectId)) throw new Error("Pipeline is already running for this project");
    const controller = new AbortController();
    this.#active.set(context.projectId, { controller });
    let activeStage: PipelineStageId | undefined;
    try {
      await this.#transition(context, { projectId: context.projectId, status: runningStatus, activeStage: stages[0], startedAt, updatedAt: new Date().toISOString() });
      for (const stage of stages) {
        activeStage = stage;
        await this.#transition(context, { projectId: context.projectId, status: runningStatus, activeStage: stage, startedAt, updatedAt: new Date().toISOString() });
        await execute(stage, stage === "analyze" ? {} : { confirmed: true }, controller.signal);
        if (controller.signal.aborted) throw Object.assign(new Error("Pipeline cancelled"), { name: "AbortError" });
      }
      return this.#transition(context, { projectId: context.projectId, status: successStatus, startedAt, updatedAt: new Date().toISOString() });
    } catch (error) {
      const cancelled = controller.signal.aborted || (error instanceof Error && error.name === "AbortError");
      return this.#transition(context, {
        projectId: context.projectId,
        status: cancelled ? "cancelled" : "failed",
        failedStage: cancelled ? undefined : activeStage,
        error: cancelled ? undefined : error instanceof Error ? error.message : String(error),
        startedAt,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      this.#active.delete(context.projectId);
    }
  }

  async #transition(context: AutoPipelineContext, run: PipelineAutomationRun): Promise<PipelineAutomationRun> {
    await this.store.save(context.root, run);
    this.events.publish(context.projectId, "pipeline", { ...run });
    return run;
  }
}
