import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpCallRecord, McpTool } from "@bridge/workbench-contracts";
import { EventBus } from "../events/event-bus.js";
import { CommandPolicy } from "../pipeline/command-policy.js";

export interface McpWorkspace { readonly projectId: string; readonly projectName: string; readonly root: string; }
export interface McpLaunchSpec { readonly executable: string; readonly args: readonly string[]; readonly cwd: string; readonly env?: Readonly<Record<string, string>>; }
export interface McpConfirmation { readonly confirmed?: boolean; readonly typedConfirmation?: string; }
export type McpMode = "mock" | "real";

export interface McpSessionSnapshot {
  readonly projectId: string;
  readonly mode: McpMode;
  readonly state: "starting" | "running" | "crashed" | "stopped";
  readonly tools: readonly McpTool[];
  readonly calls: readonly McpCallRecord[];
  readonly startedAt: string;
  readonly stoppedAt?: string;
  readonly error?: string;
}

interface ManagedSession {
  snapshot: McpSessionSnapshot;
  client: Client;
  transport: StdioClientTransport;
  workspace: McpWorkspace;
}

export interface McpSessionOptions { readonly requestTimeoutMs?: number; readonly initializationTimeoutMs?: number; readonly maxCalls?: number; }

function validateArguments(schema: Record<string, unknown>, args: Record<string, unknown>): void {
  const required = Array.isArray(schema.required) ? schema.required.filter((value): value is string => typeof value === "string") : [];
  for (const name of required) if (!(name in args)) throw new Error(`Required tool argument is missing: ${name}`);
  const properties = schema.properties && typeof schema.properties === "object" ? schema.properties as Record<string, Record<string, unknown>> : {};
  for (const [name, value] of Object.entries(args)) {
    const property = properties[name];
    if (!property) continue;
    if (Array.isArray(property.enum) && !property.enum.includes(value)) throw new Error(`Invalid enum value for ${name}`);
    const expected = property.type;
    if (expected === "integer" && (!Number.isInteger(value))) throw new Error(`Invalid integer argument: ${name}`);
    if (expected === "number" && typeof value !== "number") throw new Error(`Invalid number argument: ${name}`);
    if (expected === "string" && typeof value !== "string") throw new Error(`Invalid string argument: ${name}`);
    if (expected === "boolean" && typeof value !== "boolean") throw new Error(`Invalid boolean argument: ${name}`);
  }
}

export class McpSessionManager {
  readonly #sessions = new Map<string, ManagedSession>();
  readonly #timeout: number;
  readonly #initializationTimeout: number;
  readonly #maxCalls: number;

  constructor(readonly policy: CommandPolicy, readonly events: EventBus, options: McpSessionOptions = {}) {
    this.#timeout = options.requestTimeoutMs ?? 30_000;
    this.#initializationTimeout = options.initializationTimeoutMs ?? 10_000;
    this.#maxCalls = options.maxCalls ?? 200;
  }

  get(projectId: string): McpSessionSnapshot | undefined { return this.#sessions.get(projectId)?.snapshot; }

  async start(workspace: McpWorkspace, launch: McpLaunchSpec, mode: McpMode, confirmation: McpConfirmation): Promise<McpSessionSnapshot> {
    if (this.#sessions.get(workspace.projectId)?.snapshot.state === "running") throw new Error("MCP session is already running");
    this.policy.authorize({ operation: "mcp_start", projectId: workspace.projectId, projectName: workspace.projectName, workspaceRoot: workspace.root, cwd: launch.cwd, ...confirmation });
    // The workbench runs in-process under Electron, so `launch.executable` (process.execPath) is
    // electron.exe. Spawning `electron.exe dist/index.js` WITHOUT ELECTRON_RUN_AS_NODE does not run
    // it as a plain node stdio server — it never answers the MCP `initialize` handshake and the
    // client times out at the 10s initialization ceiling (-32001). ELECTRON_RUN_AS_NODE makes
    // electron.exe behave as node (the StdioServerTransport keeps the event loop alive until stop);
    // a harmless no-op when `launch.executable` is already node. `getDefaultEnvironment()` uses an
    // allowlist that drops it, so it must be set explicitly. Put it before `...launch.env` so a
    // caller can still override.
    const transport = new StdioClientTransport({ command: launch.executable, args: [...launch.args], cwd: launch.cwd, env: { ...getDefaultEnvironment(), ELECTRON_RUN_AS_NODE: "1", ...launch.env }, stderr: "pipe" });
    const client = new Client({ name: "bridge-visual-workbench", version: "0.1.0" }, { capabilities: {} });
    const session: ManagedSession = {
      client, transport, workspace,
      snapshot: { projectId: workspace.projectId, mode, state: "starting", tools: [], calls: [], startedAt: new Date().toISOString() },
    };
    this.#sessions.set(workspace.projectId, session);
    try {
      await client.connect(transport, { timeout: this.#initializationTimeout });
      const listed = await client.listTools(undefined, { timeout: this.#initializationTimeout });
      const tools: McpTool[] = listed.tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema as Record<string, unknown> }));
      session.snapshot = { ...session.snapshot, state: "running", tools };
      this.events.publish(workspace.projectId, "mcp", { action: "started", mode, tools: tools.length });
      return session.snapshot;
    } catch (error) {
      session.snapshot = { ...session.snapshot, state: "crashed", error: error instanceof Error ? error.message : String(error) };
      await transport.close().catch(() => undefined);
      throw error;
    }
  }

  async call(workspace: McpWorkspace, toolName: string, args: Record<string, unknown>, mode: McpMode, confirmation: McpConfirmation): Promise<McpCallRecord> {
    const session = this.#sessions.get(workspace.projectId);
    if (!session || session.snapshot.state !== "running") throw new Error("MCP session is not running");
    if (session.snapshot.mode !== mode) throw new Error(`MCP session mode is ${session.snapshot.mode}, not ${mode}`);
    const tool = session.snapshot.tools.find((candidate) => candidate.name === toolName);
    if (!tool) throw new Error(`Unknown MCP tool: ${toolName}`);
    validateArguments(tool.inputSchema, args);
    this.policy.authorize({ operation: mode === "real" ? "mcp_call_real" : "mcp_call_mock", projectId: workspace.projectId, projectName: workspace.projectName, workspaceRoot: workspace.root, cwd: workspace.root, ...confirmation });
    const started = Date.now();
    const base = { id: randomUUID(), toolName, mode, startedAt: new Date(started).toISOString(), request: args } as const;
    let record: McpCallRecord;
    try {
      const response = await session.client.callTool({ name: toolName, arguments: args }, undefined, { timeout: this.#timeout });
      record = { ...base, durationMs: Date.now() - started, response };
    } catch (error) {
      record = { ...base, durationMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
      this.record(session, record);
      this.events.publish(workspace.projectId, "mcp", { action: "call", toolName, mode, ok: false, durationMs: record.durationMs });
      throw error;
    }
    this.record(session, record);
    this.events.publish(workspace.projectId, "mcp", { action: "call", toolName, mode, ok: true, durationMs: record.durationMs });
    return record;
  }

  async stop(projectId: string, confirmation: McpConfirmation, projectName?: string): Promise<McpSessionSnapshot> {
    const session = this.#sessions.get(projectId);
    if (!session) throw new Error("MCP session does not exist");
    this.policy.authorize({ operation: "mcp_stop", projectId, projectName: projectName ?? session.workspace.projectName, workspaceRoot: session.workspace.root, cwd: session.workspace.root, ...confirmation });
    await session.client.close().catch(() => session.transport.close());
    session.snapshot = { ...session.snapshot, state: "stopped", stoppedAt: new Date().toISOString() };
    this.events.publish(projectId, "mcp", { action: "stopped" });
    return session.snapshot;
  }

  private record(session: ManagedSession, record: McpCallRecord): void {
    const calls = [...session.snapshot.calls, record].slice(-this.#maxCalls);
    session.snapshot = { ...session.snapshot, calls };
  }
}
