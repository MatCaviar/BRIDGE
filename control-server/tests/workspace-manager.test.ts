import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceManager } from "../src/import/workspace-manager.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function manager() {
  const root = await mkdtemp(join(tmpdir(), "bridge-workspace-"));
  roots.push(root);
  return new WorkspaceManager(root, { maxFiles: 3, maxFileBytes: 32, maxTotalBytes: 64 });
}

describe("WorkspaceManager", () => {
  it.each(["../escape.ts", "/absolute.ts", "C:\\escape.ts", "safe/../../escape.ts", "x\0.ts"])(
    "rejects unsafe import path %s",
    async (path) => {
      const workspaces = await manager();
      await expect(workspaces.importProject({
        projectName: "demo",
        files: [{ path, contentBase64: Buffer.from("x").toString("base64") }],
        targetSchema: { type: "object" },
      })).rejects.toThrow(/unsafe import path/i);
    },
  );

  it("rejects file-count and byte limits", async () => {
    const workspaces = await manager();
    const file = (path: string, size = 1) => ({ path, contentBase64: Buffer.alloc(size).toString("base64") });
    await expect(workspaces.importProject({
      projectName: "many",
      files: [file("1.ts"), file("2.ts"), file("3.ts"), file("4.ts")],
      targetSchema: {},
    })).rejects.toThrow(/file count/i);
    await expect(workspaces.importProject({
      projectName: "large",
      files: [file("large.ts", 33)],
      targetSchema: {},
    })).rejects.toThrow(/file size/i);
  });

  it("imports files and schema below an isolated root", async () => {
    const workspaces = await manager();
    const project = await workspaces.importProject({
      projectName: "demo app",
      files: [{ path: "src/service.ts", contentBase64: Buffer.from("export const ok = true;").toString("base64") }],
      targetSchema: { type: "object", title: "Target" },
    });
    expect(project.name).toBe("demo app");
    expect(project.root.startsWith(workspaces.runtimeRoot)).toBe(true);
    await expect(readFile(join(project.root, "source", "src", "service.ts"), "utf8")).resolves.toContain("ok");
    await expect(readFile(project.targetSchemaPath, "utf8")).resolves.toContain("Target");
  });

  it("persists the source index and recovers projects after restart", async () => {
    const workspaces = await manager();
    const project = await workspaces.importProject({
      projectName: "audio app",
      files: [{ path: "src/audio.ts", contentBase64: Buffer.from("class Audio { play() {} }").toString("base64") }],
      targetSchema: { type: "object" },
    });

    await expect(readFile(join(project.root, "source-index.json"), "utf8")).resolves.toContain('"play"');
    const restarted = new WorkspaceManager(workspaces.runtimeRoot, { maxFiles: 3, maxFileBytes: 32, maxTotalBytes: 64 });
    await expect(restarted.listProjects()).resolves.toEqual([
      expect.objectContaining({ id: project.id, name: "audio app", root: project.root }),
    ]);
  });
});
