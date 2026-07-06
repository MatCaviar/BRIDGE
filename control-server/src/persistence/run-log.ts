import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { WorkbenchEvent } from "@bridge/workbench-contracts";

/**
 * Append-only, per-project plain-text log that mirrors the renderer's live log box, so logs
 * survive restarts and can be inspected after a run. Lives at
 * `<projectRoot>/.workbench/logs/run.log`.
 *
 * - `log` events append their raw `text` (exactly what the bottom box shows).
 * - other event types (`stage`, `pipeline`, `mcp`, `artifact`, `project`) append a delimited
 *   marker line so the file reads as a trace of the whole run.
 *
 * Writes are serialized per project and never throw — logging must not break the pipeline.
 */
export class RunLog {
  readonly #path: string;
  #tail: Promise<void> = Promise.resolve();
  #ensured = false;

  constructor(projectRoot: string) {
    this.#path = join(projectRoot, ".workbench", "logs", "run.log");
  }

  append(event: WorkbenchEvent): void {
    const line = formatEvent(event);
    if (line === undefined) return;
    this.#tail = this.#tail.then(() => this.#write(line), () => this.#write(line));
  }

  /** Resolves once all queued appends have been flushed. Mainly for tests. */
  flush(): Promise<void> { return this.#tail; }

  async #write(line: string): Promise<void> {
    try {
      if (!this.#ensured) { await mkdir(join(this.#path, ".."), { recursive: true }); this.#ensured = true; }
      await appendFile(this.#path, line, "utf8");
    } catch { /* best-effort: never let logging break the pipeline */ }
  }
}

function formatEvent(event: WorkbenchEvent): string | undefined {
  if (event.type === "log") return String(event.payload.text ?? "");
  const detail = compactSummary(event.type, event.payload);
  return `\n== [${event.timestamp}] ${event.type}${detail ? ` · ${detail}` : ""} ==\n`;
}

function compactSummary(type: WorkbenchEvent["type"], payload: Record<string, unknown>): string {
  switch (type) {
    case "stage": return `${payload.stage ?? ""} ${payload.status ?? ""}`.trim();
    case "pipeline": return `${payload.status ?? ""}${payload.activeStage ? ` (${payload.activeStage})` : ""}`.trim();
    case "mcp": return `${payload.action ?? ""}`.trim();
    case "artifact": return `${payload.name ?? ""}`.trim();
    case "project": return `${payload.action ?? ""} ${payload.name ?? ""}`.trim();
    default: return "";
  }
}
