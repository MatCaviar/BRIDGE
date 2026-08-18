import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { inputSchemaFor, buildMcpServer, type ServeOptions } from "../src/commands/serve.js";
import type { AnalysisData, CapabilityDef } from "../src/types.js";
import type { InvokeOptions, InvokeResult } from "../src/commands/invoke.js";

const cap = (over: Partial<CapabilityDef>): CapabilityDef => ({
  id: "x", domain: "d", object: "o", action: "a", safetyLevel: "readonly", sdkCalls: [], sourceRef: "ref", ...over,
});

describe("inputSchemaFor (zod shape)", () => {
  it("maps Kotlin types → zod types; optional → .optional()", () => {
    const s = inputSchemaFor(cap({ params: [
      { name: "vol", type: "Int", minimum: 0, maximum: 10 },
      { name: "label", type: "String", optional: true },
    ] }));
    expect(s.vol instanceof z.ZodNumber).toBe(true);
    expect(s.label instanceof z.ZodOptional).toBe(true);
  });
  it("enum → ZodEnum, array → ZodArray, object → nested ZodObject", () => {
    const s = inputSchemaFor(cap({ params: [
      { name: "mode", type: "String", enum: ["NORMAL", "KSONG"] },
      { name: "list", type: "Array", items: { type: "String" } },
      { name: "point", type: "Object", properties: [{ name: "x", type: "Int" }] },
    ] }));
    expect(s.mode instanceof z.ZodEnum).toBe(true);
    expect(s.list instanceof z.ZodArray).toBe(true);
    expect(s.point instanceof z.ZodObject).toBe(true);
  });
  it("no params → empty shape", () => {
    expect(inputSchemaFor(cap({}))).toEqual({});
  });
});

const analysis: AnalysisData = {
  app: { name: "imaudio", framework: "android-kotlin" },
  capabilities: [
    cap({ id: "get_mic_vocal", safetyLevel: "readonly", description: "Get mic vocal level" }),
    cap({ id: "set_fast_audio_mode", safetyLevel: "normal", params: [{ name: "mode", type: "Int" }] }),
    cap({ id: "broken_one", status: "broken", safetyLevel: "readonly" }),
  ],
} as unknown as AnalysisData;

const serveOpts: ServeOptions = { analysisPath: "ignored", device: "SERIAL" };

const mockInvoke = (_adb: unknown, opts: InvokeOptions): Promise<InvokeResult> => {
  const data = opts.op === "get_mic_vocal" ? { code: 1000, data: 0 } : { code: 1000, data: true };
  return Promise.resolve({ reqId: opts.reqId ?? "r", ok: true, data, elapsedMs: 1 });
};

async function withClient<T>(invoke: typeof mockInvoke, fn: (client: Client) => Promise<T>): Promise<T> {
  const server = buildMcpServer(analysis, serveOpts, invoke as any);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(b);
  const client = new Client({ name: "test", version: "1.0" }, { capabilities: {} });
  await client.connect(a);
  try { return await fn(client); } finally { await client.close(); }
}

describe("buildMcpServer (MCP integration)", () => {
  it("lists capabilities as tools, skipping status:broken; projects inputSchema to JSON-Schema", async () => {
    const res = await withClient(mockInvoke, async (c) => c.listTools());
    const names = res.tools.map((t) => t.name);
    expect(names).toContain("get_mic_vocal");
    expect(names).toContain("set_fast_audio_mode");
    expect(names).not.toContain("broken_one");
    // Bridge built-in media tools are always exposed (切歌, no analysis needed).
    for (const a of ["media_next", "media_prev", "media_play", "media_pause"]) expect(names).toContain(a);

    const setter = res.tools.find((t) => t.name === "set_fast_audio_mode")!;
    expect(setter.inputSchema.type).toBe("object");
    expect(setter.inputSchema.properties).toHaveProperty("mode");
    expect(setter.inputSchema.required).toEqual(["mode"]);
  });

  it("routes a tool call through invoke → formatResponse", async () => {
    const res = await withClient(mockInvoke, async (c) => c.callTool({ name: "get_mic_vocal", arguments: {} }));
    const text = (res.content as Array<{ type: string; text: string }>).find((b) => b.type === "text")!.text;
    expect(JSON.parse(text)).toEqual({ ok: true, data: { code: 1000, data: 0 } });
  });

  it("forwards the tool's input args to invoke", async () => {
    let seen: InvokeOptions | undefined;
    const capture = (_adb: unknown, opts: InvokeOptions): Promise<InvokeResult> => {
      seen = opts;
      return Promise.resolve({ reqId: "r", ok: true, data: "ok", elapsedMs: 1 });
    };
    await withClient(capture as any, async (c) => c.callTool({ name: "set_fast_audio_mode", arguments: { mode: 2 } }));
    expect(seen!.op).toBe("set_fast_audio_mode");
    expect(seen!.args).toEqual({ mode: 2 });
  });

  it("routes built-in media tools (切歌) through invoke with op=media_<action>", async () => {
    let seen: InvokeOptions | undefined;
    const capture = (_adb: unknown, opts: InvokeOptions): Promise<InvokeResult> => {
      seen = opts;
      return Promise.resolve({ reqId: "r", ok: true, data: "ok", elapsedMs: 1 });
    };
    await withClient(capture as any, async (c) => c.callTool({ name: "media_play", arguments: {} }));
    expect(seen!.op).toBe("media_play");
  });
});
