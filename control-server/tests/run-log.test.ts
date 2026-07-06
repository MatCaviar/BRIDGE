import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RunLog } from "../src/persistence/run-log.js";
import type { WorkbenchEvent } from "@bridge/workbench-contracts";

const roots: string[] = [];
let root: string;

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), "bridge-runlog-")); roots.push(root); });
afterEach(async () => { await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });

function event(type: WorkbenchEvent["type"], payload: Record<string, unknown>, projectId = "p1"): WorkbenchEvent {
  return { sequence: 0, projectId, type, timestamp: "2026-07-04T00:00:00.000Z", payload };
}

describe("RunLog", () => {
  it("mirrors log text raw and marks non-log events on disk", async () => {
    const log = new RunLog(root);
    log.append(event("stage", { stage: "analyze", status: "running" }));
    log.append(event("log", { stage: "analyze", stream: "stdout", text: "hello " }));
    log.append(event("log", { stage: "analyze", stream: "stderr", text: "world\n" }));
    log.append(event("stage", { stage: "analyze", status: "passed" }));
    log.append(event("pipeline", { status: "awaiting_curate" }));
    await log.flush();

    const content = await readFile(join(root, ".workbench", "logs", "run.log"), "utf8");
    expect(content).toContain("hello world\n");
    expect(content).toContain("== [2026-07-04T00:00:00.000Z] stage · analyze running ==");
    expect(content).toContain("== [2026-07-04T00:00:00.000Z] stage · analyze passed ==");
    expect(content).toContain("== [2026-07-04T00:00:00.000Z] pipeline · awaiting_curate ==");
  });

  it("is append-only across instances sharing the same project root", async () => {
    new RunLog(root).append(event("log", { text: "first run\n" }));
    await new RunLog(root).flush();
    const second = new RunLog(root);
    second.append(event("log", { text: "second run\n" }));
    await second.flush();

    const content = await readFile(join(root, ".workbench", "logs", "run.log"), "utf8");
    expect(content).toContain("first run");
    expect(content).toContain("second run");
  });

  it("never throws when the target directory cannot be created", async () => {
    // A path whose parent is a file (not a directory) defeats recursive mkdir.
    const blocked = join(root, "file-not-dir");
    await readFile(blocked, "utf8").catch(async () => await (await import("node:fs/promises")).writeFile(blocked, "x", "utf8"));
    const log = new RunLog(join(blocked, "child", "run.log"));
    log.append(event("log", { text: "dropped\n" }));
    await log.flush();
    // No throw, and nothing written — pipeline logging is best-effort.
    await expect(readFile(join(blocked, "child", "run.log"), "utf8")).rejects.toThrow();
  });
});
