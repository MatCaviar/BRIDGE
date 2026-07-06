import { describe, expect, it, vi } from "vitest";
import { BRIDGE_CHANNELS, registerWorkbenchIpc } from "../src/register-ipc.js";

describe("registerWorkbenchIpc", () => {
  it("registers only the typed allowlist and routes native path import", async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const ipcMain = { handle: vi.fn((channel: string, handler: (...args: any[]) => unknown) => handlers.set(channel, handler)), removeHandler: vi.fn() };
    const dialog = { showOpenDialog: vi.fn()
      .mockResolvedValueOnce({ canceled: false, filePaths: ["D:/source"] })
      .mockResolvedValueOnce({ canceled: false, filePaths: ["D:/schema.json"] }) };
    const service = {
      importFromPaths: vi.fn().mockResolvedValue({ id: "p1" }), listProjects: vi.fn().mockResolvedValue([]),
      getProject: vi.fn(), getSourceIndex: vi.fn(), getArtifacts: vi.fn(), saveSelection: vi.fn(), runStage: vi.fn(),
      getPipelineRun: vi.fn().mockResolvedValue({ status: "awaiting_curate" }), retryPipeline: vi.fn(), cancelPipeline: vi.fn(),
      getMcp: vi.fn(), startMcp: vi.fn(), stopMcp: vi.fn(), callMcp: vi.fn(), subscribe: vi.fn(() => vi.fn()),
    };

    registerWorkbenchIpc({ ipcMain, dialog, service: service as any, initialSource: "D:/pre-filled" });
    expect([...handlers.keys()].sort()).toEqual([...BRIDGE_CHANNELS].sort());
    expect(await handlers.get("bridge:select-source")!({})).toBe("D:/source");
    expect(await handlers.get("bridge:select-schema")!({})).toBe("D:/schema.json");
    expect(await handlers.get("bridge:get-launch-params")!({})).toEqual({ sourceDirectory: "D:/pre-filled" });
    await handlers.get("bridge:import")!({}, { projectName: "Audio", sourceDirectory: "D:/source", schemaPath: "D:/schema.json" });
    expect(service.importFromPaths).toHaveBeenCalledWith({ projectName: "Audio", sourceDirectory: "D:/source", schemaPath: "D:/schema.json" });
    expect(handlers.has("bridge:get-pipeline")).toBe(true);
    expect(handlers.has("bridge:retry-pipeline")).toBe(true);
    expect(handlers.has("bridge:cancel-pipeline")).toBe(true);
    await handlers.get("bridge:get-pipeline")!({}, "p1");
    expect(service.getPipelineRun).toHaveBeenCalledWith("p1");
    expect(handlers.has("bridge:exec")).toBe(false);
  });
});
