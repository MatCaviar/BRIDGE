import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CommandPolicy } from "../src/pipeline/command-policy.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("CommandPolicy", () => {
  it("rejects unknown operations and paths outside the workspace", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-policy-"));
    roots.push(root);
    const policy = new CommandPolicy();

    expect(() => policy.authorize({ operation: "erase" as never, projectId: "p1", projectName: "demo", workspaceRoot: root, cwd: root })).toThrow(/unknown operation/i);
    expect(() => policy.authorize({ operation: "scan", projectId: "p1", projectName: "demo", workspaceRoot: root, cwd: join(root, "..") })).toThrow(/outside/i);
  });

  it("enforces confirmation tiers", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-policy-"));
    roots.push(root);
    const policy = new CommandPolicy();
    const common = { projectId: "p1", projectName: "demo", workspaceRoot: root, cwd: root };

    expect(() => policy.authorize({ ...common, operation: "build" })).toThrow(/confirmation/i);
    expect(() => policy.authorize({ ...common, operation: "build", confirmed: true })).not.toThrow();
    expect(() => policy.authorize({ ...common, operation: "deploy", typedConfirmation: "wrong" })).toThrow(/project name/i);
    expect(() => policy.authorize({ ...common, operation: "deploy", typedConfirmation: "demo" })).not.toThrow();
  });

  it("prevents concurrent mutations for one project", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-policy-"));
    roots.push(root);
    const policy = new CommandPolicy();
    const release = policy.acquireMutation("p1", "build");
    expect(() => policy.acquireMutation("p1", "generate")).toThrow(/already running/i);
    release();
    expect(() => policy.acquireMutation("p1", "generate")).not.toThrow();
  });
});
