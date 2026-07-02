import type { ProjectSummary } from "@bridge/workbench-contracts";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ImportLimits } from "../config.js";
import { assertContained, safeProjectId } from "../security/paths.js";

export interface ImportFile {
  readonly path: string;
  readonly contentBase64: string;
}

export interface ImportProjectRequest {
  readonly projectName: string;
  readonly files: readonly ImportFile[];
  readonly targetSchema: unknown;
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
      await rename(staging, finalRoot);
      return {
        id,
        name: request.projectName,
        root: finalRoot,
        importedAt: new Date().toISOString(),
        targetSchemaPath: join(finalRoot, "target-mcp-schema.json"),
      };
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }
}
