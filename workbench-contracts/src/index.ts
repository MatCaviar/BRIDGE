export type ConfirmationLevel = "none" | "confirm" | "typed-project-name";

export type OperationId =
  | "scan"
  | "analyze"
  | "curate"
  | "scaffold"
  | "generate"
  | "validate_config"
  | "wire_check"
  | "test"
  | "build"
  | "register"
  | "verify"
  | "schema_preview"
  | "deploy"
  | "mcp_start"
  | "mcp_stop"
  | "mcp_call_mock"
  | "mcp_call_real";

export type PipelineStageId = "import" | Exclude<OperationId, "scan" | `mcp_${string}`>;
export type StageStatus = "pending" | "running" | "passed" | "failed" | "skipped" | "blocked";

export interface PipelineStageDefinition {
  readonly id: PipelineStageId;
  readonly label: string;
  readonly kind: "input" | "agent" | "deterministic" | "deployment";
}

export const pipelineStages: readonly PipelineStageDefinition[] = [
  { id: "import", label: "Import", kind: "input" },
  { id: "analyze", label: "Analyze", kind: "agent" },
  { id: "curate", label: "Curate", kind: "input" },
  { id: "scaffold", label: "Scaffold", kind: "deterministic" },
  { id: "generate", label: "Generate", kind: "agent" },
  { id: "validate_config", label: "Validate Config", kind: "deterministic" },
  { id: "wire_check", label: "Wire Check", kind: "deterministic" },
  { id: "test", label: "Test", kind: "deterministic" },
  { id: "build", label: "Build", kind: "deterministic" },
  { id: "register", label: "Register", kind: "deterministic" },
  { id: "verify", label: "Verify", kind: "deterministic" },
  { id: "schema_preview", label: "Schema Preview", kind: "deterministic" },
  { id: "deploy", label: "Deploy", kind: "deployment" },
] as const;

const CONFIRM_OPERATIONS = new Set<OperationId>([
  "curate",
  "scaffold",
  "generate",
  "test",
  "build",
  "register",
  "verify",
  "schema_preview",
  "mcp_start",
  "mcp_stop",
  "mcp_call_mock",
]);

export function confirmationFor(operation: OperationId): ConfirmationLevel {
  if (operation === "deploy" || operation === "mcp_call_real") return "typed-project-name";
  if (CONFIRM_OPERATIONS.has(operation)) return "confirm";
  return "none";
}

export interface ProjectSummary {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly importedAt: string;
  readonly targetSchemaPath: string;
}

export interface SourceNode {
  readonly id: string;
  readonly path: string;
  readonly kind: "file" | "directory" | "symbol";
  readonly label: string;
  readonly parentId?: string;
  readonly symbolKind?: "function" | "method" | "class" | "import";
}

export interface Capability {
  readonly id: string;
  readonly domain: string;
  readonly object: string;
  readonly action: string;
  readonly sourceRef: string;
  readonly safetyLevel: string;
  readonly sdkCalls: readonly string[];
  readonly params: readonly Record<string, unknown>[];
  readonly returns?: Record<string, unknown>;
  readonly selected: boolean;
  readonly executable: boolean;
  readonly findings: readonly string[];
}

export interface ToolProjection {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly executable: boolean;
}

export interface RpcProjection {
  readonly operation: string;
  readonly type: "dbus" | "native" | "deferred" | "unknown";
  readonly valid: boolean;
}

export interface ProvenanceEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: "declares" | "selects" | "projects" | "adapts" | "wires";
}

export interface PipelineStageState {
  readonly id: PipelineStageId;
  readonly status: StageStatus;
  readonly startedAt?: string;
  readonly finishedAt?: string;
  readonly error?: string;
}

export interface PipelineRun {
  readonly id: string;
  readonly projectId: string;
  readonly stages: readonly PipelineStageState[];
}

export interface WorkbenchEvent {
  readonly sequence: number;
  readonly projectId: string;
  readonly type: "stage" | "log" | "artifact" | "mcp" | "project";
  readonly timestamp: string;
  readonly payload: Record<string, unknown>;
}

export interface McpTool {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema: Record<string, unknown>;
}

export interface McpCallRecord {
  readonly id: string;
  readonly toolName: string;
  readonly mode: "mock" | "real";
  readonly startedAt: string;
  readonly durationMs: number;
  readonly request: Record<string, unknown>;
  readonly response?: unknown;
  readonly error?: string;
}

export interface ApiEnvelope<T> {
  readonly ok: boolean;
  readonly data?: T;
  readonly error?: { readonly code: string; readonly message: string };
}
