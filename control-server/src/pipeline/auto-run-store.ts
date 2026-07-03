import type { PipelineAutomationRun } from "@bridge/workbench-contracts";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

interface PersistedAutoRun { readonly version: 1; readonly run: PipelineAutomationRun; }

export class AutoRunStore {
  path(workspaceRoot: string): string { return join(workspaceRoot, ".workbench", "auto-run.json"); }

  async load(workspaceRoot: string): Promise<PipelineAutomationRun | undefined> {
    try {
      const value = JSON.parse(await readFile(this.path(workspaceRoot), "utf8")) as PersistedAutoRun;
      return value.version === 1 && value.run?.projectId ? value.run : undefined;
    } catch { return undefined; }
  }

  async save(workspaceRoot: string, run: PipelineAutomationRun): Promise<void> {
    const path = this.path(workspaceRoot);
    const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(temporary, `${JSON.stringify({ version: 1, run }, null, 2)}\n`);
    await rename(temporary, path);
  }
}
