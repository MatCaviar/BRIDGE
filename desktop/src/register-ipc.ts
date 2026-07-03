import type { WorkbenchEvent } from "@bridge/workbench-contracts";

export const BRIDGE_CHANNELS = [
  "bridge:select-source", "bridge:select-schema", "bridge:import", "bridge:list-projects", "bridge:get-project",
  "bridge:get-source", "bridge:get-artifacts", "bridge:save-selection", "bridge:run-stage", "bridge:get-mcp",
  "bridge:start-mcp", "bridge:stop-mcp", "bridge:call-mcp", "bridge:subscribe",
  "bridge:get-pipeline", "bridge:retry-pipeline", "bridge:cancel-pipeline",
] as const;

interface IpcEventLike { readonly sender?: { readonly id?: number; send?(channel: string, value: unknown): void; once?(event: string, listener: () => void): void }; }
interface IpcMainLike { handle(channel: string, handler: (event: IpcEventLike, ...args: any[]) => unknown): void; removeHandler?(channel: string): void; }
interface DialogLike { showOpenDialog(options: Record<string, unknown>): Promise<{ canceled: boolean; filePaths: string[] }>; }
interface ServiceLike {
  importFromPaths(value: any): Promise<unknown>; listProjects(): Promise<unknown>; getProject(id: string): Promise<unknown>;
  getSourceIndex(id: string): Promise<unknown>; getArtifacts(id: string): Promise<unknown>; saveSelection(id: string, selected: string[]): Promise<unknown>;
  runStage(id: string, stage: any, confirmation: any): Promise<unknown>; getMcp(id: string): Promise<unknown>;
  startMcp(id: string, mode: any, confirmation: any): Promise<unknown>; stopMcp(id: string, confirmation: any): Promise<unknown>;
  callMcp(id: string, toolName: string, args: Record<string, unknown>, mode: any, confirmation: any): Promise<unknown>;
  getPipelineRun(id: string): Promise<unknown>; retryPipeline(id: string): Promise<unknown>; cancelPipeline(id: string): Promise<unknown>;
  subscribe(projectId: string | undefined, listener: (event: WorkbenchEvent) => void): () => void;
}

export function registerWorkbenchIpc({ ipcMain, dialog, service }: { ipcMain: IpcMainLike; dialog: DialogLike; service: ServiceLike }): () => void {
  const subscriptions = new Map<number, () => void>();
  const register = (channel: typeof BRIDGE_CHANNELS[number], handler: (event: IpcEventLike, ...args: any[]) => unknown) => ipcMain.handle(channel, handler);
  register("bridge:select-source", async () => (await dialog.showOpenDialog({ properties: ["openDirectory"] })).filePaths[0]);
  register("bridge:select-schema", async () => (await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] })).filePaths[0]);
  register("bridge:import", (_event, value) => service.importFromPaths(value));
  register("bridge:list-projects", () => service.listProjects());
  register("bridge:get-project", (_event, id) => service.getProject(String(id)));
  register("bridge:get-source", (_event, id) => service.getSourceIndex(String(id)));
  register("bridge:get-artifacts", (_event, id) => service.getArtifacts(String(id)));
  register("bridge:save-selection", (_event, id, selected) => service.saveSelection(String(id), Array.isArray(selected) ? selected.map(String) : []));
  register("bridge:run-stage", (_event, id, stage, confirmation = {}) => service.runStage(String(id), stage, confirmation));
  register("bridge:get-pipeline", (_event, id) => service.getPipelineRun(String(id)));
  register("bridge:retry-pipeline", (_event, id) => service.retryPipeline(String(id)));
  register("bridge:cancel-pipeline", (_event, id) => service.cancelPipeline(String(id)));
  register("bridge:get-mcp", (_event, id) => service.getMcp(String(id)));
  register("bridge:start-mcp", (_event, id, mode, confirmation = {}) => service.startMcp(String(id), mode, confirmation));
  register("bridge:stop-mcp", (_event, id, confirmation = {}) => service.stopMcp(String(id), confirmation));
  register("bridge:call-mcp", (_event, id, toolName, args, mode, confirmation = {}) => service.callMcp(String(id), String(toolName), args ?? {}, mode, confirmation));
  register("bridge:subscribe", (event, projectId) => {
    const sender = event.sender; const id = sender?.id;
    if (id === undefined || !sender?.send) throw new Error("IPC event sender is unavailable");
    subscriptions.get(id)?.();
    const unsubscribe = service.subscribe(projectId ? String(projectId) : undefined, (value) => sender.send!("bridge:event", value));
    subscriptions.set(id, unsubscribe);
    sender.once?.("destroyed", () => { subscriptions.get(id)?.(); subscriptions.delete(id); });
    return true;
  });
  return () => { for (const unsubscribe of subscriptions.values()) unsubscribe(); subscriptions.clear(); for (const channel of BRIDGE_CHANNELS) ipcMain.removeHandler?.(channel); };
}
