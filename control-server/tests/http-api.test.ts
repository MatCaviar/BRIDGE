import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createConfig } from "../src/config.js";
import { createWorkbenchServer } from "../src/server.js";

const roots: string[] = [];
const servers: ReturnType<typeof createWorkbenchServer>[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function start(maxRequestBytes = 1024 * 1024) {
  const runtimeRoot = await mkdtemp(join(tmpdir(), "bridge-http-")); roots.push(runtimeRoot);
  const server = createWorkbenchServer({ config: { ...createConfig({ runtimeRoot }), maxRequestBytes } });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return `http://127.0.0.1:${port}`;
}

describe("control HTTP API", () => {
  it("serves health, imports a project, scans source, and reads artifacts", async () => {
    const base = await start();
    expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({ ok: true, data: { host: "127.0.0.1" } });
    const imported = await (await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectName: "Demo", files: [{ path: "src/service.ts", contentBase64: Buffer.from("export function readStatus() {}").toString("base64") }], targetSchema: { type: "object" } }) })).json() as any;
    expect(imported.ok).toBe(true);
    const id = imported.data.id;
    const source = await (await fetch(`${base}/api/projects/${id}/source`)).json() as any;
    expect(source.data.nodes.some((node: any) => node.label === "readStatus")).toBe(true);
    const artifacts = await (await fetch(`${base}/api/projects/${id}/artifacts`)).json() as any;
    expect(artifacts.data.coverage.discovered).toBe(0);
  });

  it("rejects oversized JSON and non-loopback configuration", async () => {
    const base = await start(64);
    const response = await fetch(`${base}/api/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ padding: "x".repeat(200) }) });
    expect(response.status).toBe(413);
    expect(() => createWorkbenchServer({ config: { ...createConfig(), host: "0.0.0.0" as never } })).toThrow(/loopback/i);
  });
});
