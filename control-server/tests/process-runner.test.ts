import { describe, expect, it } from "vitest";
import { ProcessRunner } from "../src/pipeline/process-runner.js";

describe("ProcessRunner", () => {
  it("passes metacharacters as one literal argument without a shell", async () => {
    const runner = new ProcessRunner({ maxLogBytes: 16_384, defaultTimeoutMs: 5_000 });
    const literal = "safe & echo injected";
    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(JSON.stringify(process.argv[1]))", literal],
      cwd: process.cwd(),
      operation: "scan",
      projectId: "p1",
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toBe(literal);
    expect(result.stderr).toBe("");
  });

  it("bounds captured output and reports timeout", async () => {
    const runner = new ProcessRunner({ maxLogBytes: 64, defaultTimeoutMs: 5_000 });
    const noisy = await runner.run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('x'.repeat(1024))"],
      cwd: process.cwd(), operation: "scan", projectId: "p1",
    });
    expect(Buffer.byteLength(noisy.stdout)).toBeLessThanOrEqual(64);
    expect(noisy.truncated).toBe(true);

    const slow = await runner.run({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 1000)"],
      cwd: process.cwd(), operation: "scan", projectId: "p1",
      timeoutMs: 20,
      retryOnTimeout: false,
    });
    expect(slow.timedOut).toBe(true);
  });

  it("launches children with ELECTRON_RUN_AS_NODE=1 so electron.exe runs as node", async () => {
    const runner = new ProcessRunner({ defaultTimeoutMs: 5_000 });
    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(process.env.ELECTRON_RUN_AS_NODE ?? '')"],
      cwd: process.cwd(), operation: "scan", projectId: "p1",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("1");
  });

  it("lets spec.env override ELECTRON_RUN_AS_NODE", async () => {
    const runner = new ProcessRunner({ defaultTimeoutMs: 5_000 });
    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write(process.env.ELECTRON_RUN_AS_NODE ?? '')"],
      cwd: process.cwd(), operation: "scan", projectId: "p1",
      env: { ELECTRON_RUN_AS_NODE: "0" },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("0");
  });

  it("retries a stage that times out, logging a hint between attempts and after giving up", async () => {
    const runner = new ProcessRunner({ defaultTimeoutMs: 5_000, maxAttempts: 3 });
    const hints: string[] = [];
    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 60000)"],
      cwd: process.cwd(), operation: "scan", projectId: "p1",
      timeoutMs: 30,
    }, undefined, (_stream, text) => { if (text.includes("[bridge]")) hints.push(text.trim()); });
    expect(result.timedOut).toBe(true);
    // 3 attempts => 2 "retrying" hints + 1 final "gave up" hint.
    expect(hints.filter((text) => text.includes("retrying")).length).toBe(2);
    expect(hints.some((text) => text.includes("timed out after 3 attempts"))).toBe(true);
  });

  it("does not retry when retryOnTimeout is false, but still surfaces a timeout hint", async () => {
    const runner = new ProcessRunner({ defaultTimeoutMs: 5_000, maxAttempts: 3 });
    const hints: string[] = [];
    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", "setTimeout(() => {}, 60000)"],
      cwd: process.cwd(), operation: "scan", projectId: "p1",
      timeoutMs: 30,
      retryOnTimeout: false,
    }, undefined, (_stream, text) => { if (text.includes("[bridge]")) hints.push(text.trim()); });
    expect(result.timedOut).toBe(true);
    expect(hints.filter((text) => text.includes("retrying")).length).toBe(0);
    expect(hints.some((text) => text.includes("timed out after 1 attempt"))).toBe(true);
  });
});
