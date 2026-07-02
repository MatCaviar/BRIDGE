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
    });
    expect(slow.timedOut).toBe(true);
  });
});
