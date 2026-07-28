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
    await mkdir(join(root, ".workbench"), { recursive: true });
    await writeFile(join(root, ".workbench", "stages.json"), JSON.stringify({ version: 1, stages: { analyze: { id: "analyze", status: "passed" } } }));
    await mkdir(generated, { recursive: true });
    await mkdir(join(generatedRoot, "dist"), { recursive: true });
    await writeFile(join(generatedRoot, "dist", "index.js"), "// built\n");
    await writeFile(join(root, "target-mcp-schema.json"), JSON.stringify({ format: "mcp-tool-list", tools: [{ name: "reference_weather_lookup", inputSchema: { type: "object" } }] }));
    await writeFile(join(state, "analysis.json"), JSON.stringify({
      app: { name: "demo" },
      capabilities: [{
        id: "read_status", domain: "vehicle", object: "status", action: "read",
        sourceRef: "src/service.ts:readStatus", safetyLevel: "readonly", sdkCalls: ["@yunos/car"], params: [],
      }, {
        id: "preview_sound", domain: "audio", object: "sound", action: "preview",
        sourceRef: "src/audio.ts:previewSound", safetyLevel: "normal", sdkCalls: [], params: [], status: "partial",
      }],
    }));
    await writeFile(join(state, "selection.json"), JSON.stringify({ selected: ["read_status", "preview_sound"] }));
    await writeFile(join(root, "tools-schema.json"), JSON.stringify({ tools: [
      { name: "read_status", description: "Read status", inputSchema: { type: "object" }, executable: true },
      { name: "preview_sound", description: "Preview sound", inputSchema: { type: "object" }, executable: false },
    ] }));
    await writeFile(join(generated, "config.json"), JSON.stringify({ read_status: { type: "dbus" }, _deferred: { preview_sound: "transport unavailable" } }));
    const srcRpc = join(generatedRoot, "src", "rpc");
    const distRpc = join(generatedRoot, "dist", "rpc");
    await mkdir(srcRpc, { recursive: true });
    await mkdir(distRpc, { recursive: true });
    await writeFile(join(srcRpc, "rpc-client.ts"), "export async function rpcCall() {}\n");
    await writeFile(join(srcRpc, "rpc-engine.ts"), "export {};\n");
    await writeFile(join(srcRpc, "rpc-types.ts"), "export class RpcError extends Error {}\n");
    await writeFile(join(srcRpc, "rpc-types.d.ts"), "declare {};"); // must be skipped (src keeps .ts, not .d.ts)
    await writeFile(join(distRpc, "rpc-client.js"), "\"use strict\";\n");
    await writeFile(join(distRpc, "rpc-client.js.map"), "{}"); // must be skipped
    await writeFile(join(distRpc, "rpc-engine.js"), "export {};\n");
    await writeFile(join(distRpc, "rpc-types.js"), "export class RpcError {}\n");
    const result = await readArtifacts(root, "demo");
    expect(result.capabilities[0]).toMatchObject({ id: "read_status", selected: true, mockExecutable: true, realExecutable: true });
    expect(result.capabilities[1]).toMatchObject({ id: "preview_sound", selected: true, mockExecutable: true, realExecutable: false, blockedReason: "transport unavailable" });
    expect(result.edges.map((edge) => edge.relation)).toEqual(expect.arrayContaining(["declares", "selects", "projects", "wires"]));
    expect(result.coverage).toMatchObject({ discovered: 2, selected: 2, projected: 2, wired: 1 });
    expect(result.findings.join(" ")).not.toMatch(/reference_weather_lookup|no source-backed capability/i);
    expect((result as any).stages).toContainEqual({ id: "analyze", status: "passed" });
    // RPC tab projects the generated src (TypeScript) + dist (JavaScript) rpc files, skipping .d.ts/.map.
    expect(result.rpcFiles).toHaveLength(6);
    expect(result.rpcFiles.filter((f) => f.kind === "src").map((f) => f.name).sort()).toEqual(["rpc-client.ts", "rpc-engine.ts", "rpc-types.ts"]);
    expect(result.rpcFiles.filter((f) => f.kind === "dist").map((f) => f.name).sort()).toEqual(["rpc-client.js", "rpc-engine.js", "rpc-types.js"]);
    expect(result.rpcFiles.some((f) => f.name.endsWith(".d.ts") || f.name.endsWith(".map"))).toBe(false);
    expect(result.rpcFiles.find((f) => f.name === "rpc-client.ts" && f.kind === "src")?.content).toMatch(/rpcCall/);
    // findings (发现 tab) reports the deferred op, the blocked tool, and the partial-confidence capability.
    const findingsText = result.findings.join("\n");
    expect(findingsText).toMatch(/1 个操作被 deferred/);
    expect(findingsText).toMatch(/工具 preview_sound 不可执行: transport unavailable/);
    expect(findingsText).toMatch(/能力 preview_sound 状态为 partial/);
    expect(findingsText).not.toMatch(/build 产物 dist/); // build output exists in this fixture
  });

  it("turns malformed optional artifacts into findings", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-artifacts-"));
    roots.push(root);
    await mkdir(join(root, ".mcp-pipeline", "demo"), { recursive: true });
    await writeFile(join(root, ".mcp-pipeline", "demo", "analysis.json"), "{");
    const result = await readArtifacts(root, "demo");
    expect(result.findings.join(" ")).toMatch(/analysis/i);
    expect(result.findings.join(" ")).toMatch(/build 产物 dist/); // build output absent → reported
  });
});
