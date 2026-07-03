import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { WorkbenchService } from "../src/service/workbench-service.js";

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
    const service = new WorkbenchService(createConfig({ runtimeRoot }));
    const events: string[] = [];
    const unsubscribe = service.subscribe(undefined, (event) => events.push(event.type));

    const project = await service.importFromPaths({ projectName: "Local Audio", sourceDirectory, schemaPath });
    const source = await service.getSourceIndex(project.id);
    expect(source.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ label: "setMicVol", owner: "Audio" })]));
    expect(source.nodes.some((node) => node.path.endsWith("cover.bin"))).toBe(false);
    expect(events).toContain("project");
    unsubscribe();

    const restarted = new WorkbenchService(createConfig({ runtimeRoot }));
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
    const service = new WorkbenchService(createConfig({ runtimeRoot: join(root, "runtime") }));
    const project = await service.importFromPaths({ projectName: "Curate", sourceDirectory, schemaPath });
    const state = join(project.root, ".mcp-pipeline", "curate");
    await mkdir(state, { recursive: true });
    await writeFile(join(state, "analysis.json"), JSON.stringify({ capabilities: [{ id: "play_audio" }] }));
    await expect(service.saveSelection(project.id, ["invented_tool"])).rejects.toThrow(/unknown capability.*invented_tool/i);
  });
});
