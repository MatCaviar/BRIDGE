import type { ApiEnvelope, ProjectSummary } from "@bridge/workbench-contracts";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const envelope = await response.json() as ApiEnvelope<T>;
  if (!response.ok || !envelope.ok) throw new Error(envelope.error?.message ?? `Request failed: ${response.status}`);
  return envelope.data as T;
}

export const workbenchApi = {
  health: () => api<{ host: string; version: string }>("/api/health"),
  importProject: (body: unknown) => api<ProjectSummary>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  project: (id: string) => api<ProjectSummary>(`/api/projects/${id}`),
  source: <T>(id: string) => api<T>(`/api/projects/${id}/source`),
  artifacts: <T>(id: string) => api<T>(`/api/projects/${id}/artifacts`),
  selection: <T>(id: string, selected: readonly string[]) => api<T>(`/api/projects/${id}/selection`, { method: "PUT", body: JSON.stringify({ selected }) }),
  stage: <T>(id: string, stage: string, confirmation: Record<string, unknown> = {}) => api<T>(`/api/projects/${id}/stages/${stage}`, { method: "POST", body: JSON.stringify(confirmation) }),
  mcp: <T>(id: string) => api<T>(`/api/projects/${id}/mcp`),
  mcpStart: <T>(id: string, body: unknown) => api<T>(`/api/projects/${id}/mcp/start`, { method: "POST", body: JSON.stringify(body) }),
  mcpStop: <T>(id: string, body: unknown) => api<T>(`/api/projects/${id}/mcp/stop`, { method: "POST", body: JSON.stringify(body) }),
  mcpCall: <T>(id: string, body: unknown) => api<T>(`/api/projects/${id}/mcp/call`, { method: "POST", body: JSON.stringify(body) }),
};
