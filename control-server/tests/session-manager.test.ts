import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { McpSessionManager } from "../src/mcp/session-manager.js";
import { CommandPolicy } from "../src/pipeline/command-policy.js";

const root = process.cwd();
const fixture = join(root, "tests", "fixtures", "mcp-server.mjs");
const workspace = { projectId: "p1", projectName: "demo", root };
let manager: McpSessionManager | undefined;

afterEach(async () => manager?.stop("p1", { confirmed: true }).catch(() => undefined));

describe("McpSessionManager", () => {
  it("starts, initializes, lists, calls, records, and stops a real stdio session", async () => {
    manager = new McpSessionManager(new CommandPolicy(), new EventBus());
    const snapshot = await manager.start(workspace, { executable: process.execPath, args: [fixture], cwd: root }, "mock", { confirmed: true });
    expect(snapshot.state).toBe("running");
    expect(snapshot.tools.map((tool) => tool.name)).toContain("echo");

    const call = await manager.call(workspace, "echo", { text: "hello" }, "mock", { confirmed: true });
    expect(JSON.stringify(call.response)).toContain("hello");
    expect(manager.get("p1")?.calls).toHaveLength(1);
    await manager.stop("p1", { confirmed: true });
    expect(manager.get("p1")?.state).toBe("stopped");
  });

  // Under the full suite this spawns a real stdio server in parallel with process-runner /
  // pipeline-runner (which also spawn subprocesses); on a loaded Windows host the MCP initialize
  // handshake can exceed the default 10s init ceiling and fail with -32001 before this case ever
  // reaches its own 20ms call-timeout assertion. Give start() generous headroom, and give the
  // case a per-test timeout above it (the suite default in vitest.config.ts is 15s, below 30s).
  it("validates arguments, times out, and requires typed confirmation for real calls", async () => {
    manager = new McpSessionManager(new CommandPolicy(), new EventBus(), { requestTimeoutMs: 20, initializationTimeoutMs: 30_000 });
    await manager.start(workspace, { executable: process.execPath, args: [fixture], cwd: root }, "real", { confirmed: true });
    await expect(manager.call(workspace, "echo", {}, "real", { typedConfirmation: "demo" })).rejects.toThrow(/required/i);
    await expect(manager.call(workspace, "echo", { text: "hello" }, "real", { typedConfirmation: "wrong" })).rejects.toThrow(/project name/i);
    await expect(manager.call(workspace, "wait", { milliseconds: 200 }, "real", { typedConfirmation: "demo" })).rejects.toThrow(/timeout|timed out/i);
  }, 60_000);

  it("launches the server with ELECTRON_RUN_AS_NODE=1 so electron.exe answers the handshake", async () => {
    manager = new McpSessionManager(new CommandPolicy(), new EventBus());
    await manager.start(workspace, { executable: process.execPath, args: [fixture], cwd: root }, "mock", { confirmed: true });
    const call = await manager.call(workspace, "env", { name: "ELECTRON_RUN_AS_NODE" }, "mock", { confirmed: true });
    expect(JSON.stringify(call.response)).toContain("1");
  });
});
