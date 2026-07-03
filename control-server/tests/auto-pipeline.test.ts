import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PipelineStageId } from "@bridge/workbench-contracts";
import { EventBus } from "../src/events/event-bus.js";
import { AutoPipelineCoordinator, type AutoPipelineContext, type AutomaticStageExecutor } from "../src/pipeline/auto-pipeline.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

async function context(): Promise<AutoPipelineContext> {
  const root = await mkdtemp(join(tmpdir(), "bridge-auto-pipeline-"));
  roots.push(root);
  return { projectId: "project-1", root };
}

describe("AutoPipelineCoordinator", () => {
  it("pauses after Analyze then runs every post-Curate stage", async () => {
    const target = await context();
    const calls: PipelineStageId[] = [];
    const execute: AutomaticStageExecutor = async (stage) => { calls.push(stage); };
    const coordinator = new AutoPipelineCoordinator(new EventBus());

    expect(await coordinator.startAnalysis(target, execute)).toMatchObject({ status: "awaiting_curate" });
    expect(await coordinator.continueAfterCurate(target, execute)).toMatchObject({ status: "mock_ready" });
    expect(calls).toEqual([
      "analyze", "scaffold", "generate", "validate_config", "wire_check", "build", "test", "schema_preview", "verify",
    ]);
  });

  it("stops at the first failure and retries from that stage", async () => {
    const target = await context();
    const calls: PipelineStageId[] = [];
    let failWireCheck = true;
    const execute: AutomaticStageExecutor = async (stage) => {
      calls.push(stage);
      if (stage === "wire_check" && failWireCheck) throw new Error("wire mismatch");
    };
    const coordinator = new AutoPipelineCoordinator(new EventBus());

    await coordinator.startAnalysis(target, execute);
    expect(await coordinator.continueAfterCurate(target, execute)).toMatchObject({ status: "failed", failedStage: "wire_check", error: "wire mismatch" });
    expect(calls).not.toContain("test");

    failWireCheck = false;
    calls.length = 0;
    expect(await coordinator.retry(target, execute)).toMatchObject({ status: "mock_ready" });
    expect(calls).toEqual(["wire_check", "build", "test", "schema_preview", "verify"]);
  });

  it("recovers persisted state in a fresh coordinator", async () => {
    const target = await context();
    const first = new AutoPipelineCoordinator(new EventBus());
    await first.startAnalysis(target, async () => undefined);

    const second = new AutoPipelineCoordinator(new EventBus());
    await expect(second.get(target)).resolves.toMatchObject({ status: "awaiting_curate", projectId: target.projectId });
  });
});
