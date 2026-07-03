import type { PipelineAutomationRun } from "@bridge/workbench-contracts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomically } from "../persistence/atomic-file.js";

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
    await writeFileAtomically(path, `${JSON.stringify({ version: 1, run }, null, 2)}\n`);
  }
}
