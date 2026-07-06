import type { CommandSpec } from "./process-runner.js";
import type { PipelineWorkspace } from "./pipeline-runner.js";

export type AgentBackendId = "codex" | "claude";

export interface AgentBackend {
  readonly id: AgentBackendId;
  readonly executable: string;
  buildAgentCommand(workspace: PipelineWorkspace, operation: "analyze" | "generate", prompt: string): CommandSpec;
}

/** Codex CLI backend: `codex exec --sandbox workspace-write ... <prompt>`. */
export class CodexBackend implements AgentBackend {
  readonly id = "codex" as const;
  constructor(readonly executable: string) {}
  buildAgentCommand(workspace: PipelineWorkspace, operation: "analyze" | "generate", prompt: string): CommandSpec {
    return {
      executable: this.executable,
      args: ["exec", "--sandbox", "workspace-write", "--skip-git-repo-check", "--ephemeral", "--color", "never", "--cd", workspace.root, prompt],
      cwd: workspace.root,
      operation,
      projectId: workspace.projectId,
    };
  }
}

/** Claude Code CLI backend: `claude -p <prompt> --dangerously-skip-permissions --output-format text`. */
export class ClaudeBackend implements AgentBackend {
  readonly id = "claude" as const;
  constructor(readonly executable: string) {}
  buildAgentCommand(workspace: PipelineWorkspace, operation: "analyze" | "generate", prompt: string): CommandSpec {
    return {
      executable: this.executable,
      args: ["-p", prompt, "--dangerously-skip-permissions", "--output-format", "text"],
      cwd: workspace.root,
      operation,
      projectId: workspace.projectId,
    };
  }
}

export function createAgentBackend(id: AgentBackendId, executables: { readonly codex: string; readonly claude: string }): AgentBackend {
  return id === "claude" ? new ClaudeBackend(executables.claude) : new CodexBackend(executables.codex);
}
