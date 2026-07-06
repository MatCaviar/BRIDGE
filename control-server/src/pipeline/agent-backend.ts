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

/** Claude Code CLI backend: `claude -p <prompt> --dangerously-skip-permissions --output-format text --bare`. */
export class ClaudeBackend implements AgentBackend {
  readonly id = "claude" as const;
  constructor(readonly executable: string) {}
  buildAgentCommand(workspace: PipelineWorkspace, operation: "analyze" | "generate", prompt: string): CommandSpec {
    return {
      executable: this.executable,
      // `--bare` puts claude into minimal mode: it skips loading the user's installed plugins and
      // their hooks (SessionStart/PreToolUse/PostToolUse). Without it, a globally-installed plugin
      // (e.g. `superpowers`) injects a SessionStart hook that errors on Windows and adds overhead
      // to every tool call, which alone can push a multi-file analyze past its timeout. The codex
      // backend does not have this problem — `codex exec` never loads Claude Code plugins. `--bare`
      // is a harmless no-op for the built-in Read/Write tools this prompt needs, and preserves auth.
      args: ["-p", prompt, "--dangerously-skip-permissions", "--output-format", "text", "--bare"],
      cwd: workspace.root,
      operation,
      projectId: workspace.projectId,
    };
  }
}

export function createAgentBackend(id: AgentBackendId, executables: { readonly codex: string; readonly claude: string }): AgentBackend {
  return id === "claude" ? new ClaudeBackend(executables.claude) : new CodexBackend(executables.codex);
}
