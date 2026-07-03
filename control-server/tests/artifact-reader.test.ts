import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readArtifacts } from "../src/artifacts/artifact-reader.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("readArtifacts", () => {
  it("joins source, capability, selection, tool, and RPC operation", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-artifacts-"));
    roots.push(root);
    const state = join(root, ".mcp-pipeline", "demo");
    const generatedRoot = join(root, "mcp-demo");
    const generated = join(generatedRoot, "rpc");
    await mkdir(state, { recursive: true });
    await mkdir(generated, { recursive: true });
    await mkdir(join(generatedRoot, "dist"), { recursive: true });
    await writeFile(join(generatedRoot, "dist", "index.js"), "// built\n");
    await writeFile(join(root, "target-mcp-schema.json"), JSON.stringify({ format: "mcp-tool-list", tools: [{ name: "read_status", arguments: {} }, { name: "missing_target", arguments: { state: { type: "str", options: ["on", "off"] } } }] }));
    await writeFile(join(state, "analysis.json"), JSON.stringify({
      app: { name: "demo" },
      capabilities: [{
        id: "read_status", domain: "vehicle", object: "status", action: "read",
        sourceRef: "src/service.ts:readStatus", safetyLevel: "readonly", sdkCalls: ["@yunos/car"], params: [],
      }, {
        id: "preview_sound", domain: "audio", object: "sound", action: "preview",
        sourceRef: "src/audio.ts:previewSound", safetyLevel: "normal", sdkCalls: [], params: [],
      }],
    }));
    await writeFile(join(state, "selection.json"), JSON.stringify({ selected: ["read_status", "preview_sound"] }));
    await writeFile(join(state, "tools-schema.json"), JSON.stringify({ tools: [
      { name: "read_status", description: "Read status", inputSchema: { type: "object" }, executable: true },
      { name: "preview_sound", description: "Preview sound", inputSchema: { type: "object" }, executable: false },
    ] }));
    await writeFile(join(generated, "config.json"), JSON.stringify({ read_status: { type: "dbus" }, _deferred: { preview_sound: "transport unavailable" } }));
    const result = await readArtifacts(root, "demo");
    expect(result.capabilities[0]).toMatchObject({ id: "read_status", selected: true, mockExecutable: true, realExecutable: true });
    expect(result.capabilities[1]).toMatchObject({ id: "preview_sound", selected: true, mockExecutable: true, realExecutable: false, blockedReason: "transport unavailable" });
    expect(result.edges.map((edge) => edge.relation)).toEqual(expect.arrayContaining(["declares", "selects", "projects", "wires"]));
    expect(result.coverage).toMatchObject({ discovered: 2, selected: 2, projected: 2, wired: 1 });
    expect(result.targets).toHaveLength(2);
    expect(result.targets[0]).toMatchObject({ name: "read_status", matchedCapabilityIds: ["read_status"], mockExecutable: true, realExecutable: true });
    expect(result.targets[1]?.inputSchema).toMatchObject({ properties: { state: { type: "string", enum: ["on", "off"] } } });
    expect(result.findings).toContain("Target tool 'missing_target' has no source-backed capability");
  });

  it("turns malformed optional artifacts into findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-artifacts-"));
    roots.push(root);
    await mkdir(join(root, ".mcp-pipeline", "demo"), { recursive: true });
    await writeFile(join(root, ".mcp-pipeline", "demo", "analysis.json"), "{");
    const result = await readArtifacts(root, "demo");
    expect(result.findings.join(" ")).toMatch(/analysis/i);
  });
});
