#!/usr/bin/env node
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createConfig } from "../control-server/dist/config.js";
import { WorkbenchService } from "../control-server/dist/service/workbench-service.js";
import { ProcessRunner } from "../control-server/dist/pipeline/process-runner.js";

const repositoryRoot = resolve(".");
const live = process.argv.includes("--live");
const positional = process.argv.slice(2).filter((value) => !value.startsWith("--"));
const sourceDirectory = resolve(positional[0] ?? "source_code/mock-audio-android");
const schemaPath = resolve(positional[1] ?? "schema/mock-mcp-output.schema.json");
await access(sourceDirectory);
await access(schemaPath);
const runtimeRoot = await mkdtemp(resolve(tmpdir(), "bridge-mock-auto-"));

class FixtureAgentRunner {
  real = new ProcessRunner();
  async run(spec, signal, onLog) {
    if (spec.operation === "analyze") {
      const index = JSON.parse(await readFile(resolve(spec.cwd, "source-index.json"), "utf8"));
      const operations = new Set(index.evidence.map((item) => item.operation));
      const definitions = {
        get_audio_volume: { action: "get volume", safetyLevel: "readonly", params: [{ name: "zone", type: "string", optional: false, description: "Audio zone" }], returns: { type: "number", fields: [] }, sourceRef: "app/src/main/java/com/example/mockaudio/AudioControlManager.kt:getAudioVolume" },
        set_audio_volume: { action: "set volume", safetyLevel: "normal", params: [{ name: "zone", type: "string", optional: false, description: "Audio zone" }, { name: "level", type: "number", optional: false, minimum: 0, maximum: 100, description: "Volume from 0 to 100" }], returns: { type: "boolean", fields: [] }, sourceRef: "app/src/main/java/com/example/mockaudio/AudioControlManager.kt:setAudioVolume" },
        set_audio_mute: { action: "set mute", safetyLevel: "normal", params: [{ name: "zone", type: "string", optional: false, description: "Audio zone" }, { name: "muted", type: "boolean", optional: false, description: "Mute state" }], returns: { type: "boolean", fields: [] }, sourceRef: "app/src/main/java/com/example/mockaudio/AudioControlManager.kt:setAudioMute" },
      };
      const capabilities = Object.entries(definitions).filter(([id]) => operations.has(id)).map(([id, value]) => ({ id, domain: "audio", object: "audio", description: `${value.action} from verified mock source`, sdkCalls: ["IAudioControl"], ...value }));
      const path = resolve(spec.cwd, ".mcp-pipeline", "mock-audio-auto", "analysis.json");
      await mkdir(resolve(path, ".."), { recursive: true });
      await writeFile(path, `${JSON.stringify({ app: { name: "mock-audio-auto", domain: "audio", framework: "Android", entryFile: "app/src/main/java/com/example/mockaudio/AudioControlManager.kt", pages: [], permissions: [], voiceEnabled: false, dualScreen: false }, capabilities, enums: {}, errorCodes: {} }, null, 2)}\n`);
      return success("fixture source analysis complete");
    }
    if (spec.operation === "generate") {
      const selection = JSON.parse(await readFile(resolve(spec.cwd, ".mcp-pipeline", "mock-audio-auto", "selection.json"), "utf8"));
      const path = resolve(spec.cwd, "mcp-mock-audio-auto", "rpc", "config.json");
      await mkdir(resolve(path, ".."), { recursive: true });
      await writeFile(path, `${JSON.stringify({ _deferred: Object.fromEntries(selection.selected.map((id) => [id, "Android AIDL fixture has no real vehicle adapter"])) }, null, 2)}\n`);
      return success("fixture RPC judgment complete");
    }
    return this.real.run(spec, signal, onLog);
  }
}

function success(stdout) { return { exitCode: 0, signal: null, stdout, stderr: "", durationMs: 1, timedOut: false, aborted: false, truncated: false }; }

const service = new WorkbenchService(createConfig({ runtimeRoot, repositoryRoot }), live ? {} : { processRunner: new FixtureAgentRunner() });
service.subscribe(undefined, (event) => {
  if (event.type === "stage") process.stdout.write(`[stage] ${event.payload.stage}: ${event.payload.status}\n`);
  if (event.type === "pipeline") process.stdout.write(`[pipeline] ${event.payload.status}${event.payload.activeStage ? `: ${event.payload.activeStage}` : ""}\n`);
});

async function waitFor(projectId, accepted, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const run = await service.getPipelineRun(projectId);
    if (run && accepted.includes(run.status)) return run;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for pipeline status: ${accepted.join(", ")}`);
}

try {
  const project = await service.importFromPaths({ projectName: "mock-audio-auto", sourceDirectory, schemaPath });
  const analyzed = await waitFor(project.id, ["awaiting_curate", "failed"], 10 * 60_000);
  if (analyzed.status === "failed") throw new Error(`Analyze failed at ${analyzed.failedStage}: ${analyzed.error}`);
  const before = await service.getArtifacts(project.id);
  const expected = ["get_audio_volume", "set_audio_volume", "set_audio_mute"];
  const ids = before.capabilities.map((capability) => capability.id);
  const missing = expected.filter((id) => !ids.includes(id));
  if (missing.length) throw new Error(`Analyze missed source candidates: ${missing.join(", ")}`);
  if (ids.includes("reference_weather_lookup") || before.findings.some((finding) => finding.includes("reference_weather_lookup"))) throw new Error("Reference schema leaked into source candidates");
  await service.saveSelection(project.id, ["get_audio_volume", "set_audio_volume"]);
  const completed = await waitFor(project.id, ["mock_ready", "failed", "cancelled"], 15 * 60_000);
  if (completed.status !== "mock_ready") throw new Error(`Automatic pipeline stopped at ${completed.failedStage ?? completed.status}: ${completed.error ?? "no detail"}`);
  const after = await service.getArtifacts(project.id);
  await access(resolve(project.root, "mcp-mock-audio-auto", "dist", "index.js"));
  await access(resolve(project.root, "tools-schema.json"));
  process.stdout.write(`${JSON.stringify({ transport: live ? "local-service-live-agents-no-http" : "local-service-fixture-agents-no-http", sourceCandidates: ids.length, expectedCandidates: expected, selected: 2, projected: after.coverage.projected, wired: after.coverage.wired, schemaReferenceLeak: false, status: completed.status }, null, 2)}\n`);
} finally {
  await service.shutdown();
  await rm(runtimeRoot, { recursive: true, force: true });
}
