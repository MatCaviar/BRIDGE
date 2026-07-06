import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { ClaudeBackend, CodexBackend, type AgentBackend } from "../src/pipeline/agent-backend.js";
import { CommandPolicy } from "../src/pipeline/command-policy.js";
import { PipelineRunner, type PipelineWorkspace } from "../src/pipeline/pipeline-runner.js";
import type { CommandSpec, ProcessResult } from "../src/pipeline/process-runner.js";

class FakeProcessRunner {
  readonly calls: CommandSpec[] = [];
  nextExitCode = 0;
  stderr = "";
  writeOutputs = true;
  workspace?: PipelineWorkspace;
  analysisJson = `${JSON.stringify({
    app: { name: "demo", domain: "audio", framework: "Android", entryFile: "app/src/main/kotlin/Main.kt" },
    capabilities: [{ id: "get_audio_volume", domain: "audio", object: "audio", action: "getVolume", description: "get the current audio volume", sourceRef: "AudioControlManager.kt:12", safetyLevel: "readonly", sdkCalls: ["IAudioControl.getAudioVolume"] }],
  })}\n`;
  async run(spec: CommandSpec): Promise<ProcessResult> {
    this.calls.push(spec);
    if (this.writeOutputs && this.workspace && this.nextExitCode === 0) {
      if (spec.operation === "analyze") {
        await mkdir(join(this.workspace.analysisPath, ".."), { recursive: true });
        await writeFile(this.workspace.analysisPath, this.analysisJson);
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

function createRunner(fake = new FakeProcessRunner(), agent: AgentBackend = new CodexBackend("codex")) {
  fake.workspace = workspace;
  return { fake, runner: new PipelineRunner({ agent, pipelineCliPath: join(repositoryRoot, "cli", "bin", "mcp-pipeline.js") }, fake, new CommandPolicy(), new EventBus()) };
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
    expect(analyze.args.join(" ")).toContain("Do NOT run shell, bash, or PowerShell");
    expect(analyze.args.join(" ")).not.toContain("target-only APIs as gaps");
    // The analyze prompt must specify the exact enums/errorCodes sub-shapes — the schema rejects
    // unknown fields, so a vague "object" leaves the agent to guess (it wrote a flat name→number
    // map for errorCodes, which scaffold then rejected).
    expect(analyze.args.join(" ")).toContain('"prefix"');
    expect(analyze.args.join(" ")).toContain('"domainName"');
    expect(analyze.args.join(" ")).toContain('"codes"');
    expect(analyze.args.join(" ")).toContain('"sourceFile"');
    expect(analyze.args.join(" ")).toContain("flat name");
    // The schema constrains safetyLevel to a 5-value enum and param names to camelCase
    // (^[a-z][a-zA-Z0-9]*$, no underscores) — distinct from the snake_case capability id. The agent
    // wrote "safe"/"medium"/"elevated" and snake_case param names (hall_mode, operate_time), both
    // rejected by scaffold. The prompt must name the exact enum + camelCase rule to prevent that.
    expect(analyze.args.join(" ")).toContain('"p_gear_and_network"');
    expect(analyze.args.join(" ")).toContain("never invent values like");
    expect(analyze.args.join(" ")).toContain("camelCase matching ^[a-z][a-zA-Z0-9]*$");
    expect(analyze.args.join(" ")).toContain("hallMode, operateTime, tirePressure");
    expect(analyze.args).toEqual(expect.arrayContaining(["--skip-git-repo-check", "--ephemeral", "--color", "never"]));
    // Agent stages get a generous ceiling and opt out of retry-from-scratch (see agentCommand).
    expect(analyze.timeoutMs).toBe(20 * 60_000);
    expect(analyze.retryOnTimeout).toBe(false);

    runner.markPassed("scaffold");
    await runner.runStage(workspace, "generate", { confirmed: true });
    expect(fake.calls[1]!.args.join(" ")).toContain("$mcp-generate");
    expect(fake.calls[1]!.args.join(" ")).toContain(workspace.selectionPath);
    expect(fake.calls[1]!.args.join(" ")).toContain("Do NOT run shell, bash, or PowerShell");
  });

  it("builds a Claude headless analyze command when the Claude backend is selected", async () => {
    const { fake, runner } = createRunner(new FakeProcessRunner(), new ClaudeBackend("claude"));
    await runner.runStage(workspace, "analyze");
    const analyze = fake.calls[0]!;
    expect(analyze.executable).toBe("claude");
    expect(analyze.cwd).toBe(workspace.root);
    // --bare isolates the automated run from the user's installed plugins/hooks (see ClaudeBackend).
    expect(analyze.args).toEqual(expect.arrayContaining(["-p", "--dangerously-skip-permissions", "--output-format", "text", "--bare"]));
    expect(analyze.args.join(" ")).toContain("$mcp-analyze");
    expect(analyze.args).not.toContain("--skip-git-repo-check");
    // Agent stages get a generous ceiling and opt out of retry-from-scratch (see agentCommand).
    expect(analyze.timeoutMs).toBe(20 * 60_000);
    expect(analyze.retryOnTimeout).toBe(false);
  });

  it("strips a UTF-8 BOM the agent wrote at the start of analysis.json so the gate and downstream readers see valid JSON", async () => {
    const { fake, runner } = createRunner();
    fake.analysisJson = `﻿${JSON.stringify({
      app: { name: "demo", domain: "audio", framework: "Android", entryFile: "Main.kt" },
      capabilities: [{ id: "get_volume", domain: "audio", object: "audio", action: "getVolume", description: "get volume", sourceRef: "AudioControl.kt:1", safetyLevel: "readonly", sdkCalls: [] }],
    })}\n`;
    await runner.runStage(workspace, "analyze");
    expect(runner.status("analyze")).toBe("passed");
    const raw = await readFile(workspace.analysisPath, "utf8");
    expect(raw.charCodeAt(0)).not.toBe(0xfeff);
    const parsed = JSON.parse(raw);
    expect(parsed.app.name).toBe("demo");
    expect(parsed.capabilities).toHaveLength(1);
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

  it("retries once then fails when the analysis violates the schema and the correction still fails", async () => {
    const { fake, runner } = createRunner();
    fake.analysisJson = `${JSON.stringify({ app: { name: "demo" } })}\n`; // parseable but schema-invalid (no framework/entryFile/capabilities)
    await expect(runner.runStage(workspace, "analyze")).rejects.toThrow(/self-healing retry/i);
    expect(runner.status("analyze")).toBe("failed");
    // one initial attempt + one self-healing retry, both producing the same invalid output
    expect(fake.calls.filter((c) => c.operation === "analyze")).toHaveLength(2);
  });

  it("self-heals: retries once with the schema violations fed back and passes when the agent corrects them", async () => {
    // attempt 1: lowercase framework + invented safetyLevel (both enum violations)
    const bad = { app: { name: "demo", domain: "audio", framework: "android", entryFile: "Main.kt" }, capabilities: [{ id: "get_volume", domain: "audio", object: "audio", action: "getVolume", description: "get volume", sourceRef: "AudioControl.kt:1", safetyLevel: "safe", sdkCalls: [] }] };
    // attempt 2 (correction): the same content with the two violations fixed
    const good = { ...bad, app: { ...bad.app, framework: "Android" }, capabilities: [{ ...bad.capabilities[0]!, safetyLevel: "readonly" }] };
    const fake = new FakeProcessRunner();
    fake.workspace = workspace;
    fake.writeOutputs = false; // the override below controls what each analyze attempt writes
    let analyzeCall = 0;
    const originalRun = fake.run.bind(fake);
    fake.run = async (spec: CommandSpec) => {
      const result = await originalRun(spec);
      if (spec.operation === "analyze") {
        await mkdir(join(workspace.analysisPath, ".."), { recursive: true });
        await writeFile(workspace.analysisPath, `${JSON.stringify(analyzeCall++ === 0 ? bad : good)}\n`);
      }
      return result;
    };
    const { runner } = createRunner(fake);
    await runner.runStage(workspace, "analyze");
    expect(runner.status("analyze")).toBe("passed");
    const analyzeCalls = fake.calls.filter((c) => c.operation === "analyze");
    expect(analyzeCalls).toHaveLength(2);
    // the retry carries the concrete correction method: the violation list + the allowed enum
    expect(analyzeCalls[1]!.args.join(" ")).toContain("$mcp-analyze-fix");
    expect(analyzeCalls[1]!.args.join(" ")).toContain("FAILED JSON-schema validation");
    expect(analyzeCalls[1]!.args.join(" ")).toContain("must be one of [readonly, normal, p_gear_required, p_gear_and_confirm, p_gear_and_network]");
    // the persisted artifact is the corrected (valid) one
    const parsed = JSON.parse(await readFile(workspace.analysisPath, "utf8"));
    expect(parsed.app.framework).toBe("Android");
    expect(parsed.capabilities[0].safetyLevel).toBe("readonly");
  });

  it("does not retry when the first analysis is already schema-valid", async () => {
    const { fake, runner } = createRunner(); // default analysisJson is schema-valid
    await runner.runStage(workspace, "analyze");
    expect(runner.status("analyze")).toBe("passed");
    expect(fake.calls.filter((c) => c.operation === "analyze")).toHaveLength(1);
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
