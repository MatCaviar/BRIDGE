import { isAbsolute, relative, resolve } from "node:path";
import { confirmationFor, type OperationId } from "@bridge/workbench-contracts";

const OPERATIONS = new Set<OperationId>([
  "scan", "analyze", "curate", "scaffold", "generate", "validate_config",
  "wire_check", "test", "build", "register", "verify", "schema_preview",
  "deploy", "mcp_start", "mcp_stop", "mcp_call_mock", "mcp_call_real",
]);

const READ_ONLY = new Set<OperationId>(["scan", "validate_config", "wire_check", "schema_preview"]);

export interface AuthorizationRequest {
  readonly operation: OperationId;
  readonly projectId: string;
  readonly projectName: string;
  readonly workspaceRoot: string;
  readonly cwd: string;
  readonly confirmed?: boolean;
  readonly typedConfirmation?: string;
}

function assertInside(root: string, candidate: string): void {
  const base = resolve(root);
  const rel = relative(base, resolve(candidate));
  if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("Command cwd is outside the project workspace");
}

export class CommandPolicy {
  readonly #activeMutations = new Map<string, OperationId>();

  authorize(request: AuthorizationRequest): void {
    if (!OPERATIONS.has(request.operation)) throw new Error(`Unknown operation: ${String(request.operation)}`);
    assertInside(request.workspaceRoot, request.cwd);
    const level = confirmationFor(request.operation);
    if (level === "confirm" && request.confirmed !== true) throw new Error(`Confirmation required for ${request.operation}`);
    if (level === "typed-project-name" && request.typedConfirmation !== request.projectName) {
      throw new Error(`Typed confirmation must match project name: ${request.projectName}`);
    }
  }

  acquireMutation(projectId: string, operation: OperationId): () => void {
    if (READ_ONLY.has(operation)) return () => undefined;
    const active = this.#activeMutations.get(projectId);
    if (active) throw new Error(`A mutating operation is already running: ${active}`);
    this.#activeMutations.set(projectId, operation);
    let released = false;
    return () => {
      if (!released && this.#activeMutations.get(projectId) === operation) this.#activeMutations.delete(projectId);
      released = true;
    };
  }
}
