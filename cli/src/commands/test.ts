import { execFile } from "child_process";
import { resolve, basename } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { readState, writeState, createInitialState, updateStep } from "../state/manager.js";

export interface TestResults {
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
  readonly duration: number;
  readonly failures: ReadonlyArray<{
    readonly file: string;
    readonly test: string;
    readonly error: string;
  }>;
}

export async function runTests(dir: string): Promise<TestResults> {
  const resolvedDir = resolve(dir);

  return new Promise((resolvePromise, reject) => {
    execFile(
      "npx",
      ["vitest", "run", "--reporter=json"],
      { cwd: resolvedDir, shell: true, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const output = stdout || stderr;
        if (!output) {
          reject(new Error("No test output. stderr: " + (stderr || "none")));
          return;
        }

        let result: any;
        try {
          result = JSON.parse(output);
        } catch {
          reject(new Error("Failed to parse vitest JSON output. Raw: " + output.slice(0, 500)));
          return;
        }

        const failures = (result.testResults ?? []).flatMap((file: any) =>
          (file.assertionResults ?? [])
            .filter((a: any) => a.status === "failed")
            .map((a: any) => ({
              file: file.name ?? "unknown",
              test: a.fullName ?? a.title ?? "unknown",
              error: a.failureMessages?.join("\n") ?? "Unknown failure",
            })),
        );

        const startMs = result.startTime ? Number(result.startTime) : 0;
        const endMs = result.testResults?.reduce(
          (max: number, f: any) => Math.max(max, Number(f.endTime ?? 0)),
          0,
        ) || startMs;

        resolvePromise({
          passed: result.numPassedTests ?? 0,
          failed: result.numFailedTests ?? 0,
          total: result.numTotalTests ?? 0,
          duration: endMs && startMs ? endMs - startMs : 0,
          failures,
        });
      },
    );
  });
}
export async function testCommand(args: string[]): Promise<void> {
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir) {
    throw new Error("Usage: mcp-pipeline test --dir <project-dir>");
  }

  const resolvedDir = resolve(dir);
  if (!existsSync(resolvedDir)) {
    throw new Error("Directory not found: " + resolvedDir);
  }

  const appName = basename(resolvedDir);
  let state = readState(appName) ?? createInitialState(appName, resolvedDir);
  try {
    state = updateStep(state, "test", { status: "in_progress" });
    writeState(state);
  } catch {}

  try {
    const results = await runTests(resolvedDir);

    const outputDir = resolve(resolvedDir, "..", ".mcp-pipeline");
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
    writeFileSync(resolve(outputDir, "test-results.json"), JSON.stringify(results, null, 2));

    process.stdout.write("Tests: " + results.passed + "/" + results.total + " passed");
    if (results.failed > 0) {
      process.stdout.write(", " + results.failed + " FAILED\n");
      for (const f of results.failures) {
        process.stdout.write("  ✗ " + f.test + " (" + f.file + ")\n");
        process.stdout.write("    " + f.error.split("\n")[0] + "\n");
      }
    } else {
      process.stdout.write(" (" + results.duration + "ms)\n");
    }

    if (results.failed > 0) {
      const failMsg = results.failed + "/" + results.total + " tests failed";
      try {
        state = updateStep(state, "test", { status: "failed", error: failMsg });
        writeState(state);
      } catch {}
      throw new Error(failMsg);
    }

    try {
      state = updateStep(state, "test", { status: "completed" });
      writeState(state);
    } catch {}
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("tests failed")) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      try {
        state = updateStep(state, "test", { status: "failed", error: errorMsg });
        writeState(state);
      } catch {}
    }
    throw error;
  }
}
