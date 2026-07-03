import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { CommandPolicy } from "../src/pipeline/command-policy.js";
import { PipelineRunner, type PipelineWorkspace } from "../src/pipeline/pipeline-runner.js";
import type { CommandSpec, ProcessResult } from "../src/pipeline/process-runner.js";

class FakeProcessRunner {
  readonly calls: CommandSpec[] = [];
  nextExitCode = 0;
  stderr = "";
  writeOutputs = true;
  workspace?: PipelineWorkspace;
  async run(spec: CommandSpec): Promise<ProcessResult> {
    this.calls.push(spec);
    if (this.writeOutputs && this.workspace && this.nextExitCode === 0) {
      if (spec.operation === "analyze") {
        await mkdir(join(this.workspace.analysisPath, ".."), { recursive: true });
        await writeFile(this.workspace.analysisPath, "{}\n");
      }
      if (spec.operation === "scaffold") {
        await mkdir(this.workspace.generatedRoot, { recursive: true });
        await writeFile(join(this.workspace.generatedRoot, "package.json"), "{}\n");
      }
      if (spec.operation === "generate") {
        await mkdir(join(this.workspace.rpcConfigPath, ".."), { recursive: true });
        await writeFile(this.workspace.rpcConfigPath, "{}\n");
      }
      if (spec.operation === "schema_preview") await writeFile(join(this.workspace.root, "tools-schema.json"), '{"tools":[]}\n');
    }
    return { exitCode: this.nextExitCode, signal: null, stdout: "ok", stderr: this.stderr, durationMs: 1, timedOut: false, aborted: false, truncated: false };
  }
}

const repositoryRoot = process.cwd();
const roots: string[] = [];
let workspace: PipelineWorkspace;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "bridge-pipeline-"));
  roots.push(root);
  workspace = {
    projectId: "p1", projectName: "demo", root,
    sourceRoot: join(root, "source"), targetSchemaPath: join(root, "target-schema.json"),
    analysisPath: join(root, "analysis.json"), selectionPath: join(root, "selection.json"),
    generatedRoot: join(root, "generated"), rpcConfigPath: join(root, "generated", "rpc", "config.json"),
    proxyPaths: [join(root, "source", "proxy.ts")],
  };
});
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

function createRunner(fake = new FakeProcessRunner()) {
  fake.workspace = workspace;
  return { fake, runner: new PipelineRunner({ codexExecutable: "codex", pipelineCliPath: join(repositoryRoot, "cli", "bin", "mcp-pipeline.js") }, fake, new CommandPolicy(), new EventBus()) };
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
    expect(analyze.args.join(" ")).toContain(join(workspace.root, "source-index.json"));
    expect(analyze.args.join(" ")).toContain(workspace.analysisPath);
    expect(analyze.args.join(" ")).toContain("output-format reference");
    expect(analyze.args.join(" ")).toContain("Never create a capability from a schema example");
    expect(analyze.args.join(" ")).not.toContain("target-only APIs as gaps");
    expect(analyze.args).toEqual(expect.arrayContaining(["--skip-git-repo-check", "--ephemeral", "--color", "never"]));

    runner.markPassed("scaffold");
    await runner.runStage(workspace, "generate", { confirmed: true });
    expect(fake.calls[1]!.args.join(" ")).toContain("$mcp-generate");
    expect(fake.calls[1]!.args.join(" ")).toContain(workspace.selectionPath);
  });

  it("invokes deterministic CLI stages as structured node arguments", async () => {
    const { fake, runner } = createRunner();
    runner.markPassed("curate");
    await runner.runStage(workspace, "scaffold", { confirmed: true });
    expect(fake.calls[0]).toMatchObject({ executable: process.execPath, operation: "scaffold", cwd: workspace.root });
    expect(fake.calls[0]!.args).toEqual(expect.arrayContaining(["scaffold", workspace.analysisPath, "--selection", workspace.selectionPath]));
    runner.markPassed("generate");
    await runner.runStage(workspace, "validate_config");
    expect(fake.calls[1]!.args).toEqual(expect.arrayContaining(["validate_config", "--selection", workspace.selectionPath]));
    await runner.runStage(workspace, "schema_preview", { confirmed: true });
    expect(fake.calls[2]!.args).toEqual(expect.arrayContaining(["schema_preview", "--selection", workspace.selectionPath]));
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

  it("rejects a successful process when its required artifact is missing", async () => {
    const { fake, runner } = createRunner();
    fake.writeOutputs = false;
    await expect(runner.runStage(workspace, "analyze")).rejects.toThrow(/analysis\.json.*missing/i);
    expect(runner.status("analyze")).toBe("failed");
  });

  it("hydrates passed stage state in a fresh runner", async () => {
    const first = createRunner().runner;
    await first.runStage(workspace, "analyze");

    const second = createRunner().runner as PipelineRunner & { hydrate(workspace: PipelineWorkspace): Promise<void> };
    await second.hydrate(workspace);
    expect(second.status("analyze")).toBe("passed");
  });

  it("persists externally completed stages such as Curate", async () => {
    const first = createRunner().runner as PipelineRunner & { recordPassed(workspace: PipelineWorkspace, stage: "curate"): Promise<void> };
    await first.recordPassed(workspace, "curate");
    const second = createRunner().runner;
    await second.hydrate(workspace);
    expect(second.status("curate")).toBe("passed");
  });

  it("allows local verification after build without gateway registration", async () => {
    const { fake, runner } = createRunner();
    runner.markPassed("build");
    runner.markPassed("test");
    await runner.runStage(workspace, "verify", { confirmed: true });
    expect(fake.calls[0]).toMatchObject({ operation: "verify" });
  });
});
