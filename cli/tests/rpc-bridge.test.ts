import { describe, it, expect } from "vitest";
import { generateRpcBridge } from "../src/generators/rpc-bridge.js";

const SAMPLE = {
  app: { name: "testapp", domain: "cockpit", framework: "YunOS HDT", entryFile: "src/index.ts" },
  capabilities: [
    { id: "read_status", domain: "vehicle", object: "gear", action: "read_status",
      safetyLevel: "readonly", sdkCalls: ["@system.vehicle"], sourceRef: "src/s.ts:read" },
  ],
};

describe("generateRpcBridge", () => {
  it("emits 4 bridge files", () => {
    const files = generateRpcBridge(SAMPLE);
    expect(files.get("src/rpc/rpc-types.ts")).toBeTruthy();
    expect(files.get("src/rpc/rpc-engine.ts")).toBeTruthy();
    expect(files.get("src/rpc/rpc-client.ts")).toBeTruthy();
    expect(files.get("src/executors/adb-executor.ts")).toBeTruthy();
  });
  it("parametrizes rpc-client RPC_URL by app name (no imaudio literal)", () => {
    const files = generateRpcBridge(SAMPLE);
    const client = files.get("src/rpc/rpc-client.ts")!;
    expect(client).toContain("page://testapp.yunos.com/rpcagent");
    expect(client).not.toContain("imaudio");
  });
  it("rpc-engine re-exports dispatch from framework (DRY)", () => {
    const files = generateRpcBridge(SAMPLE);
    const engine = files.get("src/rpc/rpc-engine.ts")!;
    expect(engine).toContain("@im/mcp-server-framework");
  });
  it("rpc-client escapes single quotes in the cmd payload (printf-safe on the device shell)", () => {
    const client = generateRpcBridge(SAMPLE).get("src/rpc/rpc-client.ts")!;
    expect(client).toContain("cmdJson.replace(/'/g");
    expect(client).toContain("cmdEscaped");
  });
  it("rpc-client reqId is globally unique across restarts (process.pid + randomUUID)", () => {
    const client = generateRpcBridge(SAMPLE).get("src/rpc/rpc-client.ts")!;
    expect(client).toContain("randomUUID");
    expect(client).toContain("process.pid");
  });
  it("rpc-client serializes concurrent calls (shared cmd.json mailbox — no TOCTOU cross-wire)", () => {
    const client = generateRpcBridge(SAMPLE).get("src/rpc/rpc-client.ts")!;
    expect(client).toContain("rpcCallInner");          // body renamed out of the export
    expect(client).toContain("rpcChain");               // module-level serialization chain
    expect(client).toContain("export function rpcCall"); // serialized public entry
  });
  it("adb-executor marks success on exit code 0 (no dead SUCCESS: prefix)", () => {
    const exec = generateRpcBridge(SAMPLE).get("src/executors/adb-executor.ts")!;
    expect(exec).toContain("code === 0");
    expect(exec).not.toContain("SUCCESS:");
  });
});
