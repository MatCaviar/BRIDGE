import { spawn } from "node:child_process";
import type { OperationId } from "@bridge/workbench-contracts";

export interface CommandSpec {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly operation: OperationId;
  readonly projectId: string;
  readonly timeoutMs?: number;
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
}

function appendBounded(current: Buffer<ArrayBufferLike>, chunk: Buffer<ArrayBufferLike>, limit: number): { value: Buffer<ArrayBufferLike>; truncated: boolean } {
  if (current.length >= limit) return { value: current, truncated: chunk.length > 0 };
  const remaining = limit - current.length;
  return { value: Buffer.concat([current, chunk.subarray(0, remaining)]), truncated: chunk.length > remaining };
}

export class ProcessRunner {
  readonly #maxLogBytes: number;
  readonly #defaultTimeoutMs: number;

  constructor(options: ProcessRunnerOptions = {}) {
    this.#maxLogBytes = options.maxLogBytes ?? 512 * 1024;
    this.#defaultTimeoutMs = options.defaultTimeoutMs ?? 10 * 60_000;
  }

  run(spec: CommandSpec, signal?: AbortSignal, onLog?: (stream: "stdout" | "stderr", text: string) => void): Promise<ProcessResult> {
    const started = Date.now();
    return new Promise((resolvePromise, reject) => {
      let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
      let truncated = false;
      let timedOut = false;
      let aborted = false;
      let settled = false;
      const child = spawn(spec.executable, [...spec.args], {
        cwd: spec.cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: spec.env ? { ...process.env, ...spec.env } : process.env,
      });

      const stop = (): void => { if (!child.killed) child.kill(); };
      const abort = (): void => { aborted = true; stop(); };
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });

      const timeout = setTimeout(() => { timedOut = true; stop(); }, spec.timeoutMs ?? this.#defaultTimeoutMs);
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
        settled = true; clearTimeout(timeout); signal?.removeEventListener("abort", abort); reject(error);
      });
      child.on("close", (exitCode, exitSignal) => {
        if (settled) return;
        settled = true; clearTimeout(timeout); signal?.removeEventListener("abort", abort);
        resolvePromise({
          exitCode, signal: exitSignal, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"),
          durationMs: Date.now() - started, timedOut, aborted, truncated,
        });
      });
    });
  }
}
