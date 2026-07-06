import type { ProjectSummary } from "@bridge/workbench-contracts";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ImportLimits } from "../config.js";
import { assertContained, safeProjectId } from "../security/paths.js";
import { scanProject } from "../scanner/project-scanner.js";

export interface ImportFile {
  readonly path: string;
  readonly contentBase64: string;
}

export interface ImportProjectRequest {
  readonly projectName: string;
  readonly files: readonly ImportFile[];
  readonly targetSchema: unknown;
  /** Absolute path of the original local source directory, persisted so the `deploy` stage can
   *  export the generated artifact beside it. Omit for uploads. */
  readonly originalSourcePath?: string;
}

export class WorkspaceManager {
  readonly runtimeRoot: string;

  constructor(runtimeRoot: string, private readonly limits: ImportLimits) {
    this.runtimeRoot = resolve(runtimeRoot);
  }

  async importProject(request: ImportProjectRequest): Promise<ProjectSummary> {
    if (request.files.length > this.limits.maxFiles) throw new Error(`Import file count exceeds ${this.limits.maxFiles}`);
    if (!request.targetSchema || typeof request.targetSchema !== "object" || Array.isArray(request.targetSchema)) {
      throw new Error("Target schema must be a JSON object");
    }
    await mkdir(this.runtimeRoot, { recursive: true });
    const id = `${safeProjectId(request.projectName)}-${randomUUID().slice(0, 8)}`;
    const staging = join(this.runtimeRoot, `.staging-${id}`);
    const finalRoot = join(this.runtimeRoot, id);
    const sourceRoot = join(staging, "source");
    let totalBytes = 0;
    try {
      await mkdir(sourceRoot, { recursive: true });
      for (const file of request.files) {
        const target = assertContained(sourceRoot, file.path.replaceAll("\\", "/"));
        const content = Buffer.from(file.contentBase64, "base64");
        if (content.byteLength > this.limits.maxFileBytes) throw new Error(`Import file size exceeds limit: ${file.path}`);
        totalBytes += content.byteLength;
        if (totalBytes > this.limits.maxTotalBytes) throw new Error("Import total size exceeds limit");
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, content, { flag: "wx" });
      }
      const targetSchemaPath = join(staging, "target-mcp-schema.json");
      await writeFile(targetSchemaPath, `${JSON.stringify(request.targetSchema, null, 2)}\n`, { flag: "wx" });
      await writeFile(join(staging, "source-index.json"), `${JSON.stringify(await scanProject(sourceRoot), null, 2)}\n`, { flag: "wx" });
      const project: ProjectSummary = {
        id,
        name: request.projectName,
        root: finalRoot,
        importedAt: new Date().toISOString(),
        targetSchemaPath: join(finalRoot, "target-mcp-schema.json"),
        ...(request.originalSourcePath ? { originalSourcePath: request.originalSourcePath } : {}),
      };
      await writeFile(join(staging, "project.json"), `${JSON.stringify(project, null, 2)}\n`, { flag: "wx" });
      await rename(staging, finalRoot);
      return project;
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  async listProjects(): Promise<ProjectSummary[]> {
    await mkdir(this.runtimeRoot, { recursive: true });
    const projects: ProjectSummary[] = [];
    for (const entry of await readdir(this.runtimeRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith(".staging-")) continue;
      const root = assertContained(this.runtimeRoot, entry.name);
      try {
        const parsed = JSON.parse(await readFile(join(root, "project.json"), "utf8")) as Partial<ProjectSummary>;
        if (parsed.id !== entry.name || typeof parsed.name !== "string" || typeof parsed.importedAt !== "string") continue;
        const targetSchemaPath = join(root, "target-mcp-schema.json");
        if (!(await stat(join(root, "source"))).isDirectory() || !(await stat(targetSchemaPath)).isFile()) continue;
        const originalSourcePath = typeof parsed.originalSourcePath === "string" ? parsed.originalSourcePath : undefined;
        projects.push({ id: entry.name, name: parsed.name, importedAt: parsed.importedAt, root, targetSchemaPath, ...(originalSourcePath ? { originalSourcePath } : {}) });
      } catch { /* ignore incomplete or invalid workspace records */ }
    }
    return projects.sort((a, b) => a.importedAt.localeCompare(b.importedAt));
  }
}
