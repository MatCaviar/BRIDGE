import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { WorkbenchService } from "../src/service/workbench-service.js";
import type { PipelineAutomationRun } from "@bridge/workbench-contracts";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("WorkbenchService", () => {
  it("imports local source and legacy schema paths, persists the project, and emits events", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-local-service-"));
    roots.push(root);
    const sourceDirectory = join(root, "input", "audio");
    await mkdir(join(sourceDirectory, "ts"), { recursive: true });
    await writeFile(join(sourceDirectory, "ts", "Audio.ts"), `class Audio { setMicVol(value: number) { return this.iface.createMethodCallMessage("setMicVol"); } }`);
    await writeFile(join(sourceDirectory, "cover.bin"), Buffer.alloc(128));
    const schemaPath = join(root, "schema.json");
    await writeFile(schemaPath, '{"name":"set_mic_volume","arguments":{}}\n{"name":"preview_sound","arguments":{}}');
    const runtimeRoot = join(root, "runtime");
    const service = new WorkbenchService(createConfig({ runtimeRoot }), { autoStartAnalysis: false });
    const events: string[] = [];
    const unsubscribe = service.subscribe(undefined, (event) => events.push(event.type));

    const project = await service.importFromPaths({ projectName: "Local Audio", sourceDirectory, schemaPath });
    const source = await service.getSourceIndex(project.id);
    expect(source.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ label: "setMicVol", owner: "Audio" })]));
    expect(source.nodes.some((node) => node.path.endsWith("cover.bin"))).toBe(false);
    expect(events).toContain("project");
    unsubscribe();

    const restarted = new WorkbenchService(createConfig({ runtimeRoot }), { autoStartAnalysis: false });
    await restarted.ready();
    expect(await restarted.listProjects()).toEqual([expect.objectContaining({ id: project.id, name: "Local Audio" })]);
  });

  it("rejects Curate capability ids absent from analysis", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-local-curate-"));
    roots.push(root);
    const sourceDirectory = join(root, "source");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "Audio.ts"), "class Audio { play() {} }");
    const schemaPath = join(root, "schema.json");
    await writeFile(schemaPath, '{"name":"play_audio"}');
    const service = new WorkbenchService(createConfig({ runtimeRoot: join(root, "runtime") }), { autoStartAnalysis: false });
    const project = await service.importFromPaths({ projectName: "Curate", sourceDirectory, schemaPath });
    const state = join(project.root, ".mcp-pipeline", "curate");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "analysis.json"), JSON.stringify({ capabilities: [{ id: "play_audio" }] }));
    await expect(service.saveSelection(project.id, ["invented_tool"])).rejects.toThrow(/unknown capability.*invented_tool/i);
  });

  it("starts Analyze after import and continues automatically after a non-empty Curate selection", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-local-automation-"));
    roots.push(root);
    const sourceDirectory = join(root, "source");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "Audio.ts"), "class Audio { getVolume() {} }");
    const schemaPath = join(root, "schema.json");
    await writeFile(schemaPath, '{"type":"object"}');
    let run: PipelineAutomationRun | undefined;
    const calls: string[] = [];
    const automation = {
      async startAnalysis(context: { projectId: string }) { calls.push("analyze"); return run = { projectId: context.projectId, status: "awaiting_curate", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; },
      async continueAfterCurate(context: { projectId: string }) { calls.push("continue"); return run = { projectId: context.projectId, status: "mock_ready", startedAt: run!.startedAt, updatedAt: new Date().toISOString() }; },
      async get() { return run; }, async retry() { return run!; }, async cancel() { return run!; },
    };
    const service = new WorkbenchService(createConfig({ runtimeRoot: join(root, "runtime") }), { automation: automation as any });

    const project = await service.importFromPaths({ projectName: "Auto", sourceDirectory, schemaPath });
    expect(calls).toEqual(["analyze"]);
    await expect(service.getPipelineRun(project.id)).resolves.toMatchObject({ status: "awaiting_curate" });
    const state = join(project.root, ".mcp-pipeline", "auto");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "analysis.json"), JSON.stringify({ capabilities: [{ id: "get_audio_volume" }] }));

    await expect(service.saveSelection(project.id, [])).rejects.toThrow(/at least one/i);
    await service.saveSelection(project.id, ["get_audio_volume"]);
    expect(calls).toEqual(["analyze", "continue"]);
  });

  it("resetProject clears derived state and re-runs Analyze from scratch", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-local-reset-"));
    roots.push(root);
    const sourceDirectory = join(root, "source");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "Audio.ts"), "class Audio { getVolume() {} }");
    const schemaPath = join(root, "schema.json");
    await writeFile(schemaPath, '{"type":"object"}');
    const calls: string[] = [];
    const automation = {
      async startAnalysis(context: { projectId: string }) { calls.push("analyze"); return { projectId: context.projectId, status: "awaiting_curate", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; },
      async continueAfterCurate(context: { projectId: string }) { calls.push("continue"); return { projectId: context.projectId, status: "mock_ready", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; },
      async get() { return undefined; }, async retry() { return { projectId: "p", status: "mock_ready", startedAt: "", updatedAt: "" }; }, async cancel() { return { projectId: "p", status: "cancelled", startedAt: "", updatedAt: "" }; },
    };
    const service = new WorkbenchService(createConfig({ runtimeRoot: join(root, "runtime") }), { automation: automation as any });
    const project = await service.importFromPaths({ projectName: "Reset", sourceDirectory, schemaPath });
    expect(calls).toEqual(["analyze"]);
    const stateDir = join(project.root, ".mcp-pipeline", "reset");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "analysis.json"), JSON.stringify({ capabilities: [{ id: "get_audio_volume" }] }));
    await writeFile(join(stateDir, "selection.json"), JSON.stringify({ selected: ["get_audio_volume"] }));
    await mkdir(join(project.root, ".workbench"), { recursive: true });
    await writeFile(join(project.root, ".workbench", "stages.json"), JSON.stringify({ version: 1, stages: { analyze: { id: "analyze", status: "passed" } } }));
    await writeFile(join(project.root, "tools-schema.json"), JSON.stringify({ tools: [] }));

    await service.resetProject(project.id);

    await expect(stat(join(stateDir, "analysis.json"))).rejects.toThrow();
    await expect(stat(join(project.root, ".workbench", "stages.json"))).rejects.toThrow();
    await expect(stat(join(project.root, "tools-schema.json"))).rejects.toThrow();
    expect(calls).toEqual(["analyze", "analyze"]);
  });
});
