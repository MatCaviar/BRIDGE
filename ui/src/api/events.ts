import type { WorkbenchEvent } from "@bridge/workbench-contracts";

export function subscribeEvents(projectId: string, onEvent: (event: WorkbenchEvent) => void): () => void {
  const source = new EventSource(`/api/events?projectId=${encodeURIComponent(projectId)}`);
  for (const type of ["stage", "log", "artifact", "mcp", "project"] as const) source.addEventListener(type, (event) => onEvent(JSON.parse((event as MessageEvent).data)));
  return () => source.close();
}
