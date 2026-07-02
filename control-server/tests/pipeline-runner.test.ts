import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { CommandPolicy } from "../src/pipeline/command-policy.js";
import { PipelineRunner, type PipelineWorkspace } from "../src/pipeline/pipeline-runner.js";
import type { CommandSpec, ProcessResult } from "../src/pipeline/process-runner.js";

class FakeProcessRunner {
  readonly calls: CommandSpec[] = [];
  nextExitCode = 0;
  stderr = "";
  async run(spec: CommandSpec): Promise<ProcessResult> {
    this.calls.push(spec);
    return { exitCode: this.nextExitCode, signal: null, stdout: "ok", stderr: this.stderr, durationMs: 1, timedOut: false, aborted: false, truncated: false };
  }
}

const root = process.cwd();
const workspace: PipelineWorkspace = {
  projectId: "p1", projectName: "demo", root,
  sourceRoot: join(root, "source"), targetSchemaPath: join(root, "target-schema.json"),
  analysisPath: join(root, "analysis.json"), selectionPath: join(root, "selection.json"),
  generatedRoot: join(root, "generated"), rpcConfigPath: join(root, "generated", "rpc", "config.json"),
  proxyPaths: [join(root, "source", "proxy.ts")],
};

function createRunner(fake = new FakeProcessRunner()) {
  return { fake, runner: new PipelineRunner({ codexExecutable: "codex", pipelineCliPath: join(root, "cli", "bin", "mcp-pipeline.js") }, fake, new CommandPolicy(), new EventBus()) };
}

describe("PipelineRunner", () => {
  it("builds constrained Codex analyze and generate commands", async () => {
    const { fake, runner } = createRunner();
    await runner.runStage(workspace, "analyze");
    const analyze = fake.calls[0]!;
    expect(analyze.executable).toBe("codex");
    expect(analyze.args.join(" ")).toContain("$mcp-analyze");
    expect(analyze.args.join(" ")).toContain(workspace.sourceRoot);
    expect(analyze.args.join(" ")).toContain(workspace.targetSchemaPath);
    expect(analyze.args.join(" ")).toContain(workspace.analysisPath);
    expect(analyze.args).toEqual(expect.arrayContaining(["--skip-git-repo-check", "--ephemeral", "--color", "never"]));

    runner.markPassed("scaffold");
    await runner.runStage(workspace, "generate", { confirmed: true });
    expect(fake.calls[1]!.args.join(" ")).toContain("$mcp-generate");
  });

  it("invokes deterministic CLI stages as structured node arguments", async () => {
    const { fake, runner } = createRunner();
    runner.markPassed("curate");
    await runner.runStage(workspace, "scaffold", { confirmed: true });
    expect(fake.calls[0]).toMatchObject({ executable: process.execPath, operation: "scaffold", cwd: root });
    expect(fake.calls[0]!.args).toEqual(expect.arrayContaining(["scaffold", workspace.analysisPath, "--selection", workspace.selectionPath]));
  });

  it("blocks downstream stages after failed gates", async () => {
    const { fake, runner } = createRunner();
    runner.markPassed("scaffold");
    runner.markPassed("generate");
    runner.markFailed("validate_config", "invalid config");
    await expect(runner.runStage(workspace, "build", { confirmed: true })).rejects.toThrow(/blocked/i);
    await expect(runner.runStage(workspace, "deploy", { typedConfirmation: "demo" })).rejects.toThrow(/blocked/i);
    expect(() => runner.assertRealMcpReady()).toThrow(/blocked/i);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns the useful tail of failed process output", async () => {
    const { fake, runner } = createRunner();
    fake.nextExitCode = 1;
    fake.stderr = "transport retry\nYou've hit your usage limit; try again at 11:00 PM.";

    await expect(runner.runStage(workspace, "analyze")).rejects.toThrow(
      /usage limit; try again at 11:00 PM/,
    );
    expect(runner.status("analyze")).toBe("failed");
  });
});
