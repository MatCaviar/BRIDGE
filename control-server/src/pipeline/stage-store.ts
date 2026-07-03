import type { PipelineStageId, PipelineStageState } from "@bridge/workbench-contracts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomically } from "../persistence/atomic-file.js";

interface PersistedStages {
  readonly version: 1;
  readonly stages: Partial<Record<PipelineStageId, PipelineStageState>>;
}

export class StageStore {
  path(workspaceRoot: string): string { return join(workspaceRoot, ".workbench", "stages.json"); }

  async load(workspaceRoot: string): Promise<Partial<Record<PipelineStageId, PipelineStageState>>> {
    try {
      const value = JSON.parse(await readFile(this.path(workspaceRoot), "utf8")) as PersistedStages;
      return value.version === 1 && value.stages && typeof value.stages === "object" ? value.stages : {};
    } catch { return {}; }
  }

  async save(workspaceRoot: string, stages: ReadonlyMap<PipelineStageId, PipelineStageState["status"]>): Promise<void> {
    const path = this.path(workspaceRoot);
    const records = Object.fromEntries([...stages].map(([id, status]) => [id, { id, status }]));
    await writeFileAtomically(path, `${JSON.stringify({ version: 1, stages: records }, null, 2)}\n`);
  }
}
