import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import type { OperationId } from "@bridge/workbench-contracts";

export interface CommandSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly operation: OperationId;
  readonly projectId: string;
  readonly timeoutMs?: number;
  /** Opt out of the default timeout-retry. Set to `false` for stages that must not be re-run. */
  readonly retryOnTimeout?: boolean;
  readonly env?: Readonly<Record<string, string>>;
}

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly aborted: boolean;
  readonly truncated: boolean;
}

export interface ProcessRunnerOptions {
  readonly maxLogBytes?: number;
  readonly defaultTimeoutMs?: number;
  /** Total attempts for a stage that times out (1 = no retry). Defaults to 2. */
  readonly maxAttempts?: number;
}

function appendBounded(current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>, limit: number): { value: Buffer<ArrayBufferLike>; truncated: boolean } {
  if (current.length >= limit) return { value: current, truncated: chunk.length > 0 };
  const remaining = limit - current.length;
  return { value: Buffer.concat([current, chunk.subarray(0, remaining)]), truncated: chunk.length > remaining };
}

// If killing the process tree does not yield a `close` event within this window, resolve anyway so
// the stage reports a timeout instead of hanging past its deadline. A grandchild that inherited the
// stdio pipe can keep `close` from firing even after the direct child dies; this is the backstop.
const KILL_GRACE_MS = 5_000;

export class ProcessRunner {
  readonly #maxLogBytes: number;
  readonly #defaultTimeoutMs: number;
  readonly #maxAttempts: number;

  constructor(options: ProcessRunnerOptions = {}) {
    this.#maxLogBytes = options.maxLogBytes ?? 512 * 1024;
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60_000;
    this.#maxAttempts = Math.max(1, options.maxAttempts ?? 2);
  }

  /**
   * Run `spec`, retrying on timeout. A stage that exits non-zero or is aborted is NOT retried — only
   * a genuine hang (no `close` before the deadline) is, since that is almost always a transient
   * subprocess deadlock (file lock, hung tool) that a fresh spawn clears. Retry hints are sent to
   * `onLog` so they surface in both the UI log box and the persisted run log.
   */
  async run(spec: CommandSpec, signal?: AbortSignal, onLog?: (stream: "stdout" | "stderr", text: string) => void): Promise<ProcessResult> {
    const maxAttempts = spec.retryOnTimeout === false ? 1 : this.#maxAttempts;
    const timeoutMs = spec.timeoutMs ?? this.#defaultTimeoutMs;
    // Definite assignment: the loop below always runs at least once (maxAttempts ≥ 1).
    let result!: ProcessResult;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      result = await this.#runOnce(spec, signal, onLog, timeoutMs);
      // Only a timeout (not an abort, not a clean exit) is worth retrying.
      if (!result.timedOut || result.aborted) return result;
      if (attempt < maxAttempts) {
        onLog?.("stderr", `\n[bridge] Stage ${spec.operation} did not finish in ${Math.round(timeoutMs / 1000)}s — the subprocess appears hung. Killing its process tree and retrying (attempt ${attempt + 1} of ${maxAttempts})…\n`);
      } else {
        onLog?.("stderr", `\n[bridge] Stage ${spec.operation} timed out after ${maxAttempts} attempt${maxAttempts > 1 ? "s" : ""}. The subprocess kept hanging — this is usually a file lock, a hung agent, or a blocked network call. See the run log for the full output.\n`);
      }
    }
    return result;
  }

  #runOnce(spec: CommandSpec, signal: AbortSignal | undefined, onLog: ((stream: "stdout" | "stderr", text: string) => void) | undefined, timeoutMs: number): Promise<ProcessResult> {
    const started = Date.now();
    return new Promise((resolvePromise, reject) => {
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let truncated = false;
      let timedOut = false;
      let aborted = false;
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let killGrace: ReturnType<typeof setTimeout> | undefined;

      const child = spawn(spec.executable, [...spec.args], {
        cwd: spec.cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        // The control-server runs inside Electron, so `process.execPath` is electron.exe.
        // Spawning `electron.exe <script.js>` keeps the Electron app event loop alive after the
        // script finishes, so the child never emits `close` and every deterministic stage
        // (curate, scaffold, build, …) times out at the 10-minute ceiling. ELECTRON_RUN_AS_NODE
        // makes electron.exe behave as plain node (exit when the event loop drains); it is a
        // harmless no-op when `process.execPath` is already node. Put it before `spec.env` so a
        // caller can still opt out by setting ELECTRON_RUN_AS_NODE explicitly.
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", ...spec.env },
      });

      const settle = (result: ProcessResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        clearTimeout(killGrace);
        signal?.removeEventListener("abort", abort);
        resolvePromise(result);
      };
      const stop = (): void => {
        this.#killTree(child);
        // Backstop: if the tree-kill does not produce a `close` in time (taskkill failed, or a
        // grandchild still holds the inherited stdio pipe), resolve anyway so the stage cannot
        // hang past its deadline.
        if (!killGrace) killGrace = setTimeout(() => settle({ exitCode: null, signal: null, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), durationMs: Date.now() - started, timedOut, aborted, truncated }), KILL_GRACE_MS);
      };
      const abort = (): void => { aborted = true; stop(); };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });

      timeout = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
      child.stdout.on("data", (value: Buffer) => {
        const next = appendBounded(stdout, value, this.#maxLogBytes);
        stdout = next.value; truncated ||= next.truncated;
        onLog?.("stdout", value.toString("utf8"));
      });
      child.stderr.on("data", (value: Buffer) => {
        const next = appendBounded(stderr, value, this.#maxLogBytes);
        stderr = next.value; truncated ||= next.truncated;
        onLog?.("stderr", value.toString("utf8"));
      });
      child.on("error", (error) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); clearTimeout(killGrace); signal?.removeEventListener("abort", abort); reject(error);
      });
      child.on("close", (exitCode, exitSignal) => settle({
        exitCode, signal: exitSignal, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"),
        durationMs: Date.now() - started, timedOut, aborted, truncated,
      }));
    });
  }

  /**
   * Kill the direct child AND its descendants. On Windows the grandchildren (cmd.exe → npm → tsc)
   * inherit the child's stdio pipe handles; killing only the direct child leaves them running with
   * those pipes open, so `close` never fires and the stage hangs past its timeout. `taskkill /T /F`
   * walks the whole tree, which closes the pipes and lets `close` fire. `child.kill()` is kept as a
   * portable fallback for non-Windows (where there are no cmd.exe wrappers and SIGTERM suffices).
   */
  #killTree(child: ChildProcess): void {
    if (child.killed) return;
    const pid = child.pid;
    if (pid !== undefined && process.platform === "win32") {
      try {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
      } catch { /* best effort — fall through to child.kill */ }
    }
    try { if (!child.killed) child.kill(); } catch { /* best effort */ }
  }
}
