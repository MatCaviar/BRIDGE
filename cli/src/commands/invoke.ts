import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { CliAdb, mailboxPath, type Adb } from "../car/adb.js";

/**
 * invoke — the BRIDGE host→car D-step. Drives the on-car generic executor from the dev PC:
 *
 *   write cmd.json → `am start` the executor Activity → poll result.json → return.
 *
 * Deterministic orchestration over an [Adb] boundary (mockable). The executor (com.immotors.bridge.executor
 * by default) + its mailbox are derived from the package + foreground user; the op is resolved against
 * the executor's OWN external registry on-car, so this D-step carries no per-app knowledge — it works
 * for any target app reachable through the executor. See memory bridge-android-substrate-plan-a.
 */

export interface InvokeOptions {
  /** Tool id (matches a registry tool's `id`). */
  readonly op: string;
  /** Arguments object passed through to the tool. */
  readonly args?: Readonly<Record<string, unknown>>;
  /** adb device serial. */
  readonly device: string;
  /** Foreground user that runs the executor (car default 10). */
  readonly user?: number;
  /** Executor app package (default com.immotors.bridge.executor). */
  readonly pkg?: string;
  /** Executor activity component suffix (default ".ExecutorActivity"). */
  readonly activity?: string;
  /** Overall timeout for waiting on result.json (ms, default 8000). */
  readonly timeoutMs?: number;
  /** Poll interval (ms, default 500). */
  readonly pollMs?: number;
  /** Deterministic reqId (one is generated if omitted). */
  readonly reqId?: string;
  /** Injected sleep (tests pass an instant fn). Defaults to real setTimeout. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface InvokeResult {
  readonly reqId: string;
  readonly ok: boolean;
  readonly data?: unknown;
  readonly error?: string;
  readonly elapsedMs: number;
}

const DEFAULT_PKG = "com.immotors.bridge.executor";
const DEFAULT_ACTIVITY = ".ExecutorActivity";
const DEFAULT_USER = 10;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_POLL_MS = 500;

let reqCounter = 0;

/** Orchestrate one tool invocation over [adb]. Pure over the boundary — no CLI/process concerns here. */
export async function invokeTool(adb: Adb, opts: InvokeOptions): Promise<InvokeResult> {
  const pkg = opts.pkg ?? DEFAULT_PKG;
  const activity = opts.activity ?? DEFAULT_ACTIVITY;
  const user = opts.user ?? DEFAULT_USER;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const reqId = opts.reqId ?? `req-${Date.now()}-${++reqCounter}`;
  const mailbox = mailboxPath(pkg, user);
  const started = Date.now();

  // 1. Push cmd.json via /data/local/tmp (adb push can't write the app's filesDir directly), then
  //    drop it into the executor's mailbox as root + clear any stale result.
  const tmp = join(tmpdir(), `bridge-cmd-${reqId}.json`);
  writeFileSync(tmp, JSON.stringify({ reqId, op: opts.op, args: opts.args ?? {} }));
  try {
    await adb.push(tmp, "/data/local/tmp/__bridge_cmd.json");
    await adb.shell(
      `mkdir -p ${mailbox} && chmod 777 ${mailbox} && rm -f ${mailbox}/result.json && ` +
        `cp /data/local/tmp/__bridge_cmd.json ${mailbox}/cmd.json && chmod 666 ${mailbox}/cmd.json`
    );

    // 2. Trigger the executor Activity (foreground launch — bypasses the Android-14 background-service
    //    start denial; the executor binds the target app's callTool service + writes result.json).
    await adb.shell(`am start --user ${user} -n ${pkg}/${activity}`);

    // 3. Poll result.json until the executor reports this reqId (ignore stale/empty), or timeout.
    const attempts = Math.max(1, Math.ceil(timeoutMs / pollMs));
    for (let i = 0; i < attempts; i++) {
      if (i > 0) await sleep(pollMs);
      const out = await adb.shell(`cat ${mailbox}/result.json 2>/dev/null`).catch(() => "");
      const parsed = safeParseResult(out);
      if (parsed && parsed.reqId === reqId) {
        return finalize(reqId, parsed, Date.now() - started);
      }
    }
    return { reqId, ok: false, error: "TIMEOUT", elapsedMs: Date.now() - started };
  } finally {
    try { unlinkSync(tmp); } catch { /* temp best-effort */ }
  }
}

function finalize(reqId: string, r: ParsedResult, elapsedMs: number): InvokeResult {
  if (r.ok) return { reqId, ok: true, data: r.data, elapsedMs };
  return { reqId, ok: false, error: r.error ?? "EXECUTOR_ERROR", elapsedMs };
}

interface ParsedResult { reqId?: string; ok?: boolean; data?: unknown; error?: string }

function safeParseResult(out: string): ParsedResult | null {
  const trimmed = out.trim();
  if (!trimmed) return null;
  try { return JSON.parse(trimmed) as ParsedResult; } catch { return null; }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────
//  CLI wrapper
// ─────────────────────────────────────────────────────────────────

/** Parse the simple `--key value` arg style used across the CLI. */
export type InvokeArgs = {
  op?: string;
  args?: Record<string, unknown>;
  device?: string;
  user?: number;
  pkg?: string;
  activity?: string;
  timeoutMs?: number;
  pollMs?: number;
  reqId?: string;
  sleep?: (ms: number) => Promise<void>;
  json?: boolean;
};
export function parseInvokeArgs(argv: string[]): InvokeArgs {
  const o: InvokeArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = () => argv[++i];
    if (a === "--op") o.op = next()!;
    else if (a === "--args") o.args = JSON.parse(next()!) as Record<string, unknown>;
    else if (a === "--device") o.device = next()!;
    else if (a === "--user") o.user = Number(next());
    else if (a === "--package") o.pkg = next();
    else if (a === "--activity") o.activity = next();
    else if (a === "--timeout") o.timeoutMs = Number(next());
    else if (a === "--poll") o.pollMs = Number(next());
    else if (a === "--req-id") o.reqId = next();
    else if (a === "--json") o.json = true;
  }
  return o;
}

export async function invokeCommand(argv: string[]): Promise<void> {
  const parsed = parseInvokeArgs(argv);
  if (!parsed.op || !parsed.device) {
    throw new Error("invoke requires --op <id> --device <serial>  (optional: --args '<json>' --user --package --timeout --req-id --json)");
  }
  const result = await invokeTool(new CliAdb(parsed.device), parsed as InvokeOptions);
  if (parsed.json) {
    process.stdout.write(JSON.stringify(result) + "\n");
  } else {
    if (result.ok) {
      process.stdout.write(`✓ ${parsed.op} [${result.elapsedMs}ms]\n`);
      if (result.data !== undefined) process.stdout.write(JSON.stringify(result.data, null, 2) + "\n");
    } else {
      process.stdout.write(`✗ ${parsed.op}: ${result.error} [${result.elapsedMs}ms]\n`);
    }
  }
  if (!result.ok) throw new Error(`${parsed.op}: ${result.error}`);
}
