import { readFileSync } from "fs";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { formatResponse } from "../utils/response.js";
import type { AnalysisData, CapabilityDef, FieldShape, ParamDef } from "../types.js";
import { CliAdb } from "../car/adb.js";
import { invokeTool, type InvokeOptions } from "./invoke.js";

/**
 * serve — run the BRIDGE MCP server on the host (stdio JSON-RPC). Exposes the target app's capabilities
 * (read from analysis.json) as MCP tools; each tool call routes through the `invoke` D-step → on-car
 * generic executor → target app's callTool service. This is the piece that lets an external LLM
 * (Claude Desktop, etc.) drive car tools directly.
 *
 * Tool surface (name / description / inputSchema / safetyLevel) is projected from analysis.json — the
 * rich interface surface from mcp-analyze. The car-side executor resolves the op id to a method via its
 * own registry, so this server stays app-agnostic.
 */

export interface ServeOptions extends Pick<InvokeOptions, "device" | "user" | "pkg" | "activity" | "timeoutMs"> {
  readonly analysisPath: string;
  /** Include tools marked status:"broken" (default false — they're known no-ops). */
  readonly includeBroken?: boolean;
}

/** Project a capability's params to a Zod raw shape (the SDK wraps it as an object inputSchema). */
export function inputSchemaFor(cap: CapabilityDef): Record<string, z.ZodTypeAny> {
  return paramsToZodShape(cap.params ?? []);
}

function paramsToZodShape(ps: readonly ParamDef[]): Record<string, z.ZodTypeAny> {
  const out: Record<string, z.ZodTypeAny> = {};
  for (const p of ps) out[p.name] = p.optional ? fieldZod(p).optional() : fieldZod(p);
  return out;
}

function fieldZod(p: ParamDef | FieldShape): z.ZodTypeAny {
  let s: z.ZodTypeAny;
  if (p.enum && p.enum.length > 0) {
    s = z.enum(p.enum as [string, ...string[]]);
  } else {
    const t = jsonType(p.type);
    if (t === "number") {
      let n = z.number();
      if ("minimum" in p && p.minimum !== undefined) n = n.min(p.minimum);
      if ("maximum" in p && p.maximum !== undefined) n = n.max(p.maximum);
      s = n;
    } else if (t === "boolean") s = z.boolean();
    else if (t === "array") s = z.array(p.items ? fieldZod(p.items) : z.unknown());
    else if (t === "object") s = z.object(paramsToZodShape(p.properties ?? []));
    else s = z.string();
  }
  if (p.description) s = s.describe(p.description);
  return s;
}

function jsonType(t: string): string {
  const lt = t.toLowerCase();
  if (/^(int|long|short|byte|float|double|number)/.test(lt)) return "number";
  if (/^(bool)/.test(lt)) return "boolean";
  if (/^(array|list|set)/.test(lt)) return "array";
  if (/^(object|map)/.test(lt)) return "object";
  return "string";
}

/**
 * Build the McpServer with one tool per capability. Pure over the invoke boundary — pass a mock invoke
 * in tests; production passes the real `invokeTool` (which uses a CliAdb internally).
 */
export function buildMcpServer(
  analysis: AnalysisData,
  opts: ServeOptions,
  invoke: typeof invokeTool = invokeTool
): McpServer {
  const server = new McpServer({
    name: `bridge-${analysis.app?.name ?? "car"}`,
    version: "1.0.0",
  });
  const adb = new CliAdb(opts.device);
  const caps = analysis.capabilities ?? [];

  const register = (id: string, description: string, inputSchema: Record<string, never>) => {
    server.registerTool(id, { description, inputSchema }, async (input: Record<string, unknown>) => {
      try {
        const res = await invoke(adb, {
          op: id, args: input, device: opts.device,
          user: opts.user, pkg: opts.pkg, activity: opts.activity, timeoutMs: opts.timeoutMs,
        });
        return formatResponse(res.ok ? { ok: true, data: res.data } : { ok: false, error: res.error });
      } catch (e) {
        return formatResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    });
  };

  for (const cap of caps) {
    if (!opts.includeBroken && cap.status === "broken") continue;
    const description = cap.description?.trim() ||
      `${cap.domain}/${cap.object}/${cap.action} (${cap.safetyLevel})`;
    register(cap.id, description, inputSchemaFor(cap) as Record<string, never>);
  }

  // Bridge built-in media tools (切歌): bridge-level, work for ANY media app exposing a MediaSession.
  // The executor handles `media_*` ops without a registry entry (mechanism=media).
  for (const action of ["next", "prev", "play", "pause"] as const) {
    register(`media_${action}`, `Control media playback: ${action} on the active session`, {});
  }
  return server;
}

// ─────────────────────────────────────────────────────────────────
//  CLI wrapper
// ─────────────────────────────────────────────────────────────────

export function parseServeArgs(argv: string[]): ServeOptions {
  const o: { analysisPath?: string; device?: string; user?: number; pkg?: string; activity?: string; timeoutMs?: number; includeBroken?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i];
    if (a === "--analysis") o.analysisPath = next()!;
    else if (a === "--device") o.device = next()!;
    else if (a === "--user") o.user = Number(next());
    else if (a === "--package") o.pkg = next();
    else if (a === "--activity") o.activity = next();
    else if (a === "--timeout") o.timeoutMs = Number(next());
    else if (a === "--include-broken") o.includeBroken = true;
  }
  return o as ServeOptions;
}

export async function serveCommand(argv: string[]): Promise<void> {
  const opts = parseServeArgs(argv);
  if (!opts.analysisPath || !opts.device) {
    throw new Error("serve requires --analysis <analysis.json> --device <serial>  (optional: --user --package --activity --timeout --include-broken)");
  }
  const analysis = JSON.parse(readFileSync(opts.analysisPath, "utf-8")) as AnalysisData;
  const server = buildMcpServer(analysis, opts);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Runs until the LLM client closes stdio.
}

// Re-exported for tests that need the SDK client to drive an in-process server.
export { Client };
