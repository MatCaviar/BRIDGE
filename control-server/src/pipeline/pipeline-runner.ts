import type { OperationId, PipelineStageId, StageStatus } from "@bridge/workbench-contracts";
import { EventBus } from "../events/event-bus.js";
import type { AgentBackend } from "./agent-backend.js";
import { CommandPolicy } from "./command-policy.js";
import type { CommandSpec, ProcessResult } from "./process-runner.js";
import { readFile, stat, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { StageStore } from "./stage-store.js";
import { analyzeCorrectionPrompt, validateAnalysis } from "./analysis-validator.js";

export interface PipelineRunnerConfig {
  readonly agent: AgentBackend;
  readonly pipelineCliPath: string;
  readonly gatewayRoot?: string;
}

export interface PipelineWorkspace {
  readonly projectId: string;
  readonly projectName: string;
  readonly root: string;
  readonly sourceRoot: string;
  readonly targetSchemaPath: string;
  readonly analysisPath: string;
  readonly selectionPath: string;
  readonly generatedRoot: string;
  readonly rpcConfigPath: string;
  readonly proxyPaths: readonly string[];
  /** Where the `deploy` stage exports the generated artifact: a sibling of the original source
   *  directory. `undefined` when the project was uploaded (no original path) — deploy then refuses
   *  with a clear error rather than writing to an unknown location. */
  readonly deployTarget?: string;
}

export interface StageConfirmation { readonly confirmed?: boolean; readonly typedConfirmation?: string; }
export interface ProcessExecutor { run(spec: CommandSpec, signal?: AbortSignal, onLog?: (stream: "stdout" | "stderr", text: string) => void): Promise<ProcessResult>; }

const GATES: readonly PipelineStageId[] = ["validate_config", "wire_check", "test"];
const ANSI_ESCAPE = /\u001B(?:[@-_]|\[[0-?]*[ -/]*[@-~])/g;
const REQUIRED: Partial<Record<PipelineStageId, readonly PipelineStageId[]>> = {
  curate: ["analyze"], scaffold: ["curate"], generate: ["scaffold"],
  validate_config: ["generate"], wire_check: ["generate"], build: ["validate_config", "wire_check"],
  test: ["build"], register: ["build"], verify: ["build", "test"], schema_preview: ["generate"], deploy: ["verify"],
};

/** The generate stage runs the agent under `claude --bare`, which skips loading globally-installed
 *  plugins (including this one) — so the `$mcp-generate` skill trigger never resolves and the agent
 *  receives NO op→wire-spec format guidance, producing a `{methods:[...]}` list instead of an op map.
 *  Inject the skill's SKILL.md directly into the prompt to bypass the skill-trigger mechanism.
 *  Cached after first read. Path resolved via resolvePluginResource (walks up to plugin root). */
let cachedGenerateSkill: string | null = null;

/** Resolve a plugin-root resource (e.g. skills/mcp-generate/SKILL.md) without assuming a fixed
 *  parent depth. See analysis-validator.ts: when this package is loaded from the installed
 *  workbench's node_modules copy, `../../../<resource>` lands under node_modules/@bridge/ and misses
 *  (the SKILL.md read silently falls back to "" and the generate stage loses its op->wire-spec
 *  guidance). Walk up until the file exists; fall back to the 3-up guess for a recognizable path. */
function resolvePluginResource(...segments: string[]): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, ...segments);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ...segments);
}

function generateSkillContext(): string {
  if (cachedGenerateSkill !== null) return cachedGenerateSkill;
  try {
    const skillPath = resolvePluginResource("skills", "mcp-generate", "SKILL.md");
    let content = readFileSync(skillPath, "utf8");
    // Strip the YAML frontmatter: SKILL.md starts with `---`, and `claude -p <prompt>` parses a
    // leading `---` as an unknown CLI option ("error: unknown option '---'"), failing the stage
    // before the agent even runs. The frontmatter is skill metadata the agent doesn't need.
    const fm = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
    if (fm) content = content.slice(fm[0].length);
    cachedGenerateSkill = content.replace(/^\s+/, "");
  } catch {
    cachedGenerateSkill = ""; // skill file missing — fall back to bare prompt (no worse than before)
  }
  return cachedGenerateSkill;
}

export class PipelineRunner {
  readonly #states = new Map<PipelineStageId, StageStatus>();
  #hydratedRoot?: string;

  constructor(
    readonly config: PipelineRunnerConfig,
    readonly processRunner: ProcessExecutor,
    readonly policy: CommandPolicy,
    readonly events: EventBus,
    readonly stageStore = new StageStore(),
  ) {}

  async hydrate(workspace: PipelineWorkspace): Promise<void> {
    if (this.#hydratedRoot === workspace.root) return;
    const persisted = await this.stageStore.load(workspace.root);
    for (const [id, state] of Object.entries(persisted)) {
      if (state) this.#states.set(id as PipelineStageId, state.status);
    }
    this.#hydratedRoot = workspace.root;
  }

  markPassed(stage: PipelineStageId): void { this.#states.set(stage, "passed"); }
  markFailed(stage: PipelineStageId, error: string): void {
    this.#states.set(stage, "failed");
    this.events.publish("system", "stage", { stage, status: "failed", error });
  }
  async recordPassed(workspace: PipelineWorkspace, stage: PipelineStageId): Promise<void> {
    await this.hydrate(workspace);
    this.#states.set(stage, "passed");
    await this.stageStore.save(workspace.root, this.#states);
    this.events.publish(workspace.projectId, "stage", { stage, status: "passed" });
  }
  status(stage: PipelineStageId): StageStatus { return this.#states.get(stage) ?? "pending"; }

  assertRealMcpReady(): void {
    const failed = GATES.find((gate) => this.status(gate) === "failed");
    if (failed) throw new Error(`Real MCP mode is blocked by failed gate ${failed}`);
    for (const required of ["validate_config", "wire_check", "test", "build"] as const) {
      if (this.status(required) !== "passed") throw new Error(`Real MCP mode is blocked until ${required} passes`);
    }
  }

  async runStage(workspace: PipelineWorkspace, operation: Exclude<OperationId, `mcp_${string}` | "scan">, confirmation: StageConfirmation = {}, signal?: AbortSignal): Promise<ProcessResult> {
    const stage = operation as PipelineStageId;
    await this.hydrate(workspace);
    this.assertRunnable(stage);
    this.policy.authorize({ operation, projectId: workspace.projectId, projectName: workspace.projectName, workspaceRoot: workspace.root, cwd: workspace.root, ...confirmation });
    const release = this.policy.acquireMutation(workspace.projectId, operation);
    this.#states.set(stage, "running");
    await this.stageStore.save(workspace.root, this.#states);
    this.events.publish(workspace.projectId, "stage", { stage, status: "running" });
    try {
      const spec = this.commandFor(workspace, operation);
      const result = await this.processRunner.run(spec, signal, (stream, text) => this.events.publish(workspace.projectId, "log", { stage, stream, text }));
      const passed = result.exitCode === 0 && !result.timedOut && !result.aborted;
      if (!passed) {
        this.#states.set(stage, "failed");
        await this.stageStore.save(workspace.root, this.#states);
        this.events.publish(workspace.projectId, "stage", { stage, status: "failed", exitCode: result.exitCode, timedOut: result.timedOut, aborted: result.aborted });
        throw new Error(stageFailure(stage, result));
      }
      try {
        await this.#normalizeAgentOutput(stage, workspace);
        if (stage === "analyze") await this.#analyzeWithSelfHeal(workspace, signal);
        await assertStageOutput(stage, workspace);
      } catch (error) {
        this.#states.set(stage, "failed");
        await this.stageStore.save(workspace.root, this.#states);
        const message = error instanceof Error ? error.message : String(error);
        this.events.publish(workspace.projectId, "stage", { stage, status: "failed", error: message });
        throw error;
      }
      this.#states.set(stage, "passed");
      await this.stageStore.save(workspace.root, this.#states);
      this.events.publish(workspace.projectId, "stage", { stage, status: "passed", exitCode: result.exitCode, timedOut: result.timedOut, aborted: result.aborted });
      return result;
    } finally {
      release();
    }
  }

  private assertRunnable(stage: PipelineStageId): void {
    const failedGate = GATES.find((gate) => this.status(gate) === "failed");
    if (failedGate && ["build", "register", "verify", "deploy"].includes(stage)) throw new Error(`Stage ${stage} is blocked by failed gate ${failedGate}`);
    const missing = (REQUIRED[stage] ?? []).find((dependency) => this.status(dependency) !== "passed");
    if (missing) throw new Error(`Stage ${stage} is blocked until ${missing} passes`);
  }

  private commandFor(workspace: PipelineWorkspace, operation: Exclude<OperationId, `mcp_${string}` | "scan">): CommandSpec {
    if (operation === "analyze") return this.agentCommand(workspace, operation, `$mcp-analyze Analyze only ${workspace.sourceRoot} using deterministic source index ${join(workspace.root, "source-index.json")} and imported MCP output-format reference ${workspace.targetSchemaPath}. The imported schema is ONLY a descriptor shape / parameter encoding / style reference for the tools that will eventually be generated — it is NOT the analysis output format. Never create a capability from a schema example or report an example as missing. Discover candidates exclusively from verified live source evidence. Treat declarations and RPC evidence in the index as navigation evidence, then verify every promoted capability against live source. Detect YunOS versus Android from source evidence and record it in app.framework. For Android, inspect Kotlin, Java, AIDL, manifests, and bundled SDK reference Markdown. Write machine-readable analysis to ${workspace.analysisPath} as JSON with EXACTLY this top-level shape and no other top-level keys: { "app": { "name": string, "domain": string, "framework": "YunOS HDT" | "Android", "entryFile": string }, "capabilities": [ { "id": string (snake_case), "domain": string, "object": string, "action": string, "sourceRef": string, "safetyLevel": "readonly" | "normal" | "p_gear_required" | "p_gear_and_confirm" | "p_gear_and_network", "sdkCalls": string[], "params"?: [{ "name": string (camelCase), "type": string, "optional"?: boolean, "description"?: string, "enum"?: string[], "examples"?: string[], "defaultValue"?: string|number|boolean, "properties"?: ParamDef[], "items"?: { "type": string } }], "returns"?: { "type": string, "fields"?: (string | { "name": string, "type": string })[] }, "description"?: string, "status"?: "verified" | "partial" | "broken" } ], "enums"?: { [enumName: string]: { "values": string[], "type": "string" | "number", "sourceFile"?: string, "map"?: { [wireValue: string]: string } } }, "errorCodes"?: { [domain: string]: { "prefix": number (1..99), "domainName": string, "codes": { [codeName: string]: { "value": number (0..99), "message": string (zh-CN, non-empty) } } } } }. "enums" and "errorCodes" MUST follow those exact sub-shapes — the validator rejects unknown fields. In particular do NOT write "errorCodes" as a flat name→number map: each domain needs "prefix"+"domainName"+"codes", and each code needs "value"+"message". "safetyLevel" MUST be exactly one of those 5 strings — never invent values like "safe"/"medium"/"elevated"/"low"/"high": "readonly" = pure read, no state change; "normal" = ordinary side effect; "p_gear_required" = requires P-gear; "p_gear_and_confirm" = requires P-gear + user confirmation; "p_gear_and_network" = requires P-gear + network. Each param "name" MUST be camelCase matching ^[a-z][a-zA-Z0-9]*$ with NO underscores (e.g. hallMode, operateTime, tirePressure) — this differs from the snake_case capability "id", so convert any snake_case source field to camelCase when used as a param name. "capabilities" MUST be a non-empty array; each "id" is a stable snake_case tool name; each "sourceRef" MUST cite verified live source (file path + line); "sdkCalls" lists the SDK/RPC calls backing the capability. Do NOT emit "tools", "inputSchema", "inspection", "summary", "project", or "platform" as top-level keys — those are not the analysis format. Write ONLY the file ${workspace.analysisPath} by creating or overwriting that single file. Do NOT run shell, bash, or PowerShell commands; do NOT copy, move, install, build, fetch, or use the network; do NOT touch node_modules or any file other than ${workspace.analysisPath}. Output the analysis file and stop.`);
    if (operation === "generate") return this.agentCommand(workspace, operation, `${generateSkillContext()}

---

$mcp-generate Generate only RPC configuration for ${workspace.generatedRoot} using ${workspace.sourceRoot}, ${workspace.analysisPath}, and Curate selection ${workspace.selectionPath}. Generate entries only for capability ids in selection.json. Write ONLY the file ${workspace.rpcConfigPath} by creating or overwriting that single file. Do NOT run shell, bash, or PowerShell commands; do NOT copy, move, install, build, fetch, or use the network; do NOT touch node_modules or any file other than ${workspace.rpcConfigPath}. Output the RPC config file and stop.`);
    if (operation === "deploy") {
      // Export the generated `mcp-<app>` artifact to a sibling of the original source directory,
      // restoring the headless "product beside source" layout. The target is derived from the
      // trusted, persisted originalSourcePath (never caller-supplied at deploy time), and the whole
      // operation is gated behind typed-project-name confirmation. retryOnTimeout:false because a
      // half-finished tree-copy must not be re-run blindly — the CLI removes the prior target first.
      if (!workspace.deployTarget) throw new Error("Deploy target is unavailable: this project has no recorded original source directory to place the artifact beside. Re-import from a local source directory to enable export.");
      return { executable: process.execPath, args: [this.config.pipelineCliPath, "deploy", "--from", workspace.generatedRoot, "--to", workspace.deployTarget], cwd: workspace.root, operation, projectId: workspace.projectId, retryOnTimeout: false };
    }

    const args: string[] = [this.config.pipelineCliPath];
    switch (operation) {
      case "curate": args.push("curate", workspace.analysisPath, "--output", workspace.selectionPath); break;
      case "scaffold": args.push("scaffold", workspace.analysisPath, "--output", workspace.generatedRoot, "--selection", workspace.selectionPath); break;
      case "validate_config": args.push("validate_config", workspace.rpcConfigPath, "--analysis", workspace.analysisPath, "--selection", workspace.selectionPath); break;
      case "wire_check": args.push("wire_check", workspace.rpcConfigPath, ...workspace.proxyPaths.flatMap((path) => ["--proxy", path])); break;
      case "test": case "build": args.push(operation, "--dir", workspace.generatedRoot); break;
      case "register":
        if (!this.config.gatewayRoot) throw new Error("Gateway root is not configured");
        args.push("register", "--dir", workspace.generatedRoot, "--gateway", this.config.gatewayRoot); break;
      case "verify": args.push("verify", "--dir", workspace.generatedRoot, ...(this.config.gatewayRoot ? ["--gateway", this.config.gatewayRoot] : [])); break;
      case "schema_preview": args.push("schema_preview", workspace.analysisPath, workspace.rpcConfigPath, "--selection", workspace.selectionPath, "--output", `${workspace.root}/tools-schema.json`); break;
    }
    return { executable: process.execPath, args, cwd: workspace.root, operation, projectId: workspace.projectId };
  }

  private agentCommand(workspace: PipelineWorkspace, operation: "analyze" | "generate", prompt: string): CommandSpec {
    const spec = this.config.agent.buildAgentCommand(workspace, operation, prompt);
    // Agent stages read many source files and emit a large analysis/generation, which routinely
    // exceeds the ProcessRunner's 10-minute default on hosted models. A timed-out agent must NOT
    // be retried — restarting from scratch just burns another full window and times out again at
    // the same point, so disable the default timeout-retry and raise the ceiling for agent stages.
    return { ...spec, timeoutMs: 20 * 60_000, retryOnTimeout: false };
  }

  /** The agent (claude/codex) may emit a UTF-8 BOM at the start of the JSON it writes — model/tool
   *  dependent, and observed with claude on Windows. Node's `JSON.parse` rejects a leading BOM,
   *  which would fail this stage's gate AND every downstream CLI reader (curate/scaffold/validate/
   *  wire_check) that re-reads the file. Strip it once on disk, right after the agent finishes, so
   *  the persisted artifact is plain valid JSON. A no-op when no BOM is present. */
  async #normalizeAgentOutput(stage: PipelineStageId, workspace: PipelineWorkspace): Promise<void> {
    const path = stage === "analyze" ? workspace.analysisPath : stage === "generate" ? workspace.rpcConfigPath : undefined;
    if (!path) return;
    try {
      const raw = await readFile(path, "utf8");
      if (raw.charCodeAt(0) === 0xfeff) await writeFile(path, raw.slice(1), "utf8");
    } catch { /* file may not exist or be unwritable; assertStageOutput will report the real error */ }
  }

  /** Self-healing gate for the analyze stage: validate the agent's analysis against the schema and,
   *  if it violates the schema, retry the agent ONCE with the violation list fed back so the second
   *  attempt carries a concrete correction (not a blind re-run). The agent is expensive (~9 min) and
   *  has repeatedly produced schema-invalid output — flat errorCodes, snake_case param names,
   *  invented safetyLevel values. Re-running from scratch without the errors would reproduce them;
   *  feeding the validator's path→constraint list lets the agent patch its own output. Bounded to one
   *  retry: a missing/unparseable file (agent produced nothing) fails immediately with no retry, and a
   *  second schema failure surfaces the full list rather than burning more agent windows. */
  async #analyzeWithSelfHeal(workspace: PipelineWorkspace, signal?: AbortSignal): Promise<void> {
    let result = await validateAnalysis(workspace.analysisPath);
    if (result.ok) return; // first attempt already schema-valid — no retry
    if (!result.retryable) throw new Error(`Stage analyze output ${result.errors}`); // missing/unparseable: not a fixable schema mistake
    this.events.publish(workspace.projectId, "log", { stage: "analyze" as PipelineStageId, stream: "stderr" as const, text: `analysis failed schema validation; retrying once with the violation list fed back to the agent:\n${result.errors}` });
    const correction = analyzeCorrectionPrompt(workspace.analysisPath, result.errors);
    const ran = await this.processRunner.run(
      this.agentCommand(workspace, "analyze", correction),
      signal,
      (stream, text) => this.events.publish(workspace.projectId, "log", { stage: "analyze" as PipelineStageId, stream, text }),
    );
    if (ran.exitCode !== 0 || ran.timedOut || ran.aborted) throw new Error(`Stage analyze self-heal retry ${stageFailure("analyze", ran)}`);
    await this.#normalizeAgentOutput("analyze", workspace);
    result = await validateAnalysis(workspace.analysisPath);
    if (!result.ok) throw new Error(`Stage analyze output still fails schema validation after 1 self-healing retry:\n${result.errors}`);
  }
}

async function assertStageOutput(stage: PipelineStageId, workspace: PipelineWorkspace): Promise<void> {
  // analyze is gated by #analyzeWithSelfHeal (full schema validation); the other stages get a
  // lightweight required-artifact + JSON-parse check so a silent no-op fails fast at its own gate.
  if (stage === "deploy") return assertDeployOutput(workspace);
  const required: Partial<Record<PipelineStageId, { path: string; json?: boolean }>> = {
    curate: { path: workspace.selectionPath, json: true },
    scaffold: { path: join(workspace.generatedRoot, "package.json"), json: true },
    generate: { path: workspace.rpcConfigPath, json: true },
    build: { path: join(workspace.generatedRoot, "dist", "index.js") },
    schema_preview: { path: join(workspace.root, "tools-schema.json"), json: true },
  };
  const output = required[stage];
  if (!output) return;
  try {
    if (!(await stat(output.path)).isFile()) throw new Error("not a file");
    if (output.json) JSON.parse(await readFile(output.path, "utf8"));
  } catch {
    throw new Error(`Stage ${stage} output ${output.path.split(/[\\/]/).at(-1)} is missing or invalid`);
  }
}

/** `deploy` exports the artifact to a sibling of the original source — outside the runtime root —
 *  so it gets its own directory check rather than the file/JSON check above. */
async function assertDeployOutput(workspace: PipelineWorkspace): Promise<void> {
  if (!workspace.deployTarget) return; // defensive: commandFor already refused an undefined target
  try {
    if (!(await stat(workspace.deployTarget)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Stage deploy output ${workspace.deployTarget.split(/[\\/]/).at(-1)} is missing or not a directory`);
  }
}

function stageFailure(stage: PipelineStageId, result: ProcessResult): string {
  const reason = result.aborted
    ? "aborted"
    : result.timedOut
      ? "timed out"
      : `exited with code ${result.exitCode ?? "unknown"}`;
  const output = (result.stderr.trim() || result.stdout.trim())
    .replace(ANSI_ESCAPE, "")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-12)
    .join("\n")
    .slice(-4000);
  const truncation = result.truncated ? " (log truncated)" : "";
  return `Stage ${stage} ${reason}${truncation}${output ? `:\n${output}` : ""}`;
}
