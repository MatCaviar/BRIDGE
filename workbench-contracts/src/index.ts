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
  { id: "import", label: "导入", kind: "input" },
  { id: "analyze", label: "分析", kind: "agent" },
  { id: "curate", label: "筛选", kind: "input" },
  { id: "scaffold", label: "脚手架", kind: "deterministic" },
  { id: "generate", label: "生成", kind: "agent" },
  { id: "validate_config", label: "校验配置", kind: "deterministic" },
  { id: "wire_check", label: "接线检查", kind: "deterministic" },
  { id: "build", label: "构建", kind: "deterministic" },
  { id: "test", label: "测试", kind: "deterministic" },
  { id: "register", label: "注册", kind: "deterministic" },
  { id: "verify", label: "验证", kind: "deterministic" },
  { id: "schema_preview", label: "Schema 预览", kind: "deterministic" },
  { id: "deploy", label: "部署", kind: "deployment" },
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
  readonly kind: "file" | "directory" | "symbol" | "evidence";
  readonly label: string;
  readonly parentId?: string;
  readonly symbolKind?: "function" | "method" | "class" | "interface" | "object";
  readonly owner?: string;
  readonly visibility?: "public" | "protected" | "private";
  readonly line?: number;
}

export interface SourceEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: "contains" | "imports" | "calls";
}

export interface RpcEvidence {
  readonly id: string;
  readonly path: string;
  readonly line: number;
  readonly operation: string;
  readonly transport: "dbus" | "native" | "aidl";
}

export interface SourceIndex {
  readonly version: 1;
  readonly nodes: readonly SourceNode[];
  readonly edges: readonly SourceEdge[];
  readonly evidence: readonly RpcEvidence[];
  readonly findings: readonly string[];
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
  /** @deprecated Prefer mockExecutable and realExecutable. */
  readonly executable: boolean;
  readonly mockExecutable: boolean;
  readonly realExecutable: boolean;
  readonly blockedReason?: string;
  readonly findings: readonly string[];
}

export interface ToolProjection {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  /** @deprecated Prefer mockExecutable and realExecutable. */
  readonly executable: boolean;
  readonly mockExecutable: boolean;
  readonly realExecutable: boolean;
  readonly blockedReason?: string;
}

export interface TargetProjection {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly matchedCapabilityIds: readonly string[];
  /** @deprecated Prefer mockExecutable and realExecutable. */
  readonly executable: boolean;
  readonly mockExecutable: boolean;
  readonly realExecutable: boolean;
  readonly blockedReason?: string;
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

export type PipelineAutomationStatus = "analyzing" | "awaiting_curate" | "running" | "failed" | "mock_ready" | "cancelled";

export interface PipelineAutomationRun {
  readonly projectId: string;
  readonly status: PipelineAutomationStatus;
  readonly activeStage?: PipelineStageId;
  readonly failedStage?: PipelineStageId;
  readonly error?: string;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export const automaticPostCurateStages = [
  "scaffold", "generate", "validate_config", "wire_check", "build", "test", "schema_preview", "verify",
] as const satisfies readonly PipelineStageId[];

export interface WorkbenchEvent {
  readonly sequence: number;
  readonly projectId: string;
  readonly type: "stage" | "log" | "artifact" | "mcp" | "project" | "pipeline";
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
