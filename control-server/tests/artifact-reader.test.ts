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
    const generated = join(root, "mcp-demo", "rpc");
    await mkdir(state, { recursive: true });
    await mkdir(generated, { recursive: true });
    await writeFile(join(root, "target-mcp-schema.json"), JSON.stringify({ format: "mcp-tool-list", tools: [{ name: "read_status", arguments: {} }, { name: "missing_target", arguments: { state: { type: "str", options: ["on", "off"] } } }] }));
    await writeFile(join(state, "analysis.json"), JSON.stringify({
      app: { name: "demo" },
      capabilities: [{
        id: "read_status", domain: "vehicle", object: "status", action: "read",
        sourceRef: "src/service.ts:readStatus", safetyLevel: "readonly", sdkCalls: ["@yunos/car"], params: [],
      }],
    }));
    await writeFile(join(state, "selection.json"), JSON.stringify({ selected: ["read_status"] }));
    await writeFile(join(state, "tools-schema.json"), JSON.stringify({ tools: [{ name: "read_status", description: "Read status", inputSchema: { type: "object" }, executable: true }] }));
    await writeFile(join(generated, "config.json"), JSON.stringify({ read_status: { type: "dbus" } }));
    const result = await readArtifacts(root, "demo");
    expect(result.capabilities[0]).toMatchObject({ id: "read_status", selected: true, executable: true });
    expect(result.edges.map((edge) => edge.relation)).toEqual(expect.arrayContaining(["declares", "selects", "projects", "wires"]));
    expect(result.coverage).toMatchObject({ discovered: 1, selected: 1, projected: 1, wired: 1 });
    expect(result.targets).toHaveLength(2);
    expect(result.targets[0]).toMatchObject({ name: "read_status", matchedCapabilityIds: ["read_status"], executable: true });
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
