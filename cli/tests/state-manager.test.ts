import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "fs";
import { resolve } from "path";
import {
  createInitialState,
  readState,
  writeState,
  updateStep,
  stateFilePath,
} from "../src/state/manager.js";

const TEST_DIR = resolve(import.meta.dirname, "__test_state__");

describe("createInitialState", () => {
  it("creates state with all steps pending", () => {
    const state = createInitialState("test-app", "/path/to/app");
    expect(state.app).toBe("test-app");
    expect(state.appPath).toBe("/path/to/app");
    expect(state.currentStep).toBe("validate");
    expect(Object.keys(state.steps)).toHaveLength(8);
    for (const step of Object.values(state.steps)) {
      expect(step.status).toBe("pending");
    }
  });
});

describe("updateStep", () => {
  it("marks step as completed and advances currentStep", () => {
    let state = createInitialState("test", "/path");
    state = updateStep(state, "validate", { status: "completed" });
    expect(state.steps.validate.status).toBe("completed");
    expect(state.currentStep).toBe("analyze");
  });

  it("marks step as failed without advancing", () => {
    let state = createInitialState("test", "/path");
    state = updateStep(state, "validate", { status: "failed", error: "bad schema" });
    expect(state.steps.validate.status).toBe("failed");
    expect(state.steps.validate.error).toBe("bad schema");
    expect(state.currentStep).toBe("validate");
  });

  it("advances to done after verify completes", () => {
    let state = createInitialState("test", "/path");
    for (const step of ["validate", "analyze", "scaffold", "generate", "test", "build", "register", "verify"] as const) {
      state = updateStep(state, step, { status: "completed" });
    }
    expect(state.currentStep).toBe("done");
  });

  it("preserves immutability — original state unchanged", () => {
    const original = createInitialState("test", "/path");
    const updated = updateStep(original, "validate", { status: "completed" });
    expect(original.steps.validate.status).toBe("pending");
    expect(updated.steps.validate.status).toBe("completed");
    expect(original).not.toBe(updated);
  });

  it("validate_config / wire_check are inline sub-steps — recorded but do NOT change currentStep", () => {
    let state = createInitialState("test", "/path");
    for (const step of ["validate", "analyze", "scaffold"] as const) state = updateStep(state, step, { status: "completed" });
    expect(state.currentStep).toBe("generate");
    // regression: completing an inline sub-step used to reset currentStep to "validate"
    state = updateStep(state, "validate_config", { status: "completed" });
    expect(state.currentStep).toBe("generate");
    state = updateStep(state, "wire_check", { status: "completed" });
    expect(state.currentStep).toBe("generate");
    expect(state.steps.validate_config.status).toBe("completed");
    expect(state.steps.wire_check.status).toBe("completed");
  });
});

describe("readState / writeState", () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  });

  it("returns null when no state file exists", () => {
    const result = readState("nonexistent", TEST_DIR);
    expect(result).toBeNull();
  });

  it("round-trips state through disk", () => {
    let state = createInitialState("roundtrip", "/path/to/app");
    state = updateStep(state, "validate", { status: "completed", output: "ok" });
    writeState(state, TEST_DIR);

    const loaded = readState("roundtrip", TEST_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.app).toBe("roundtrip");
    expect(loaded!.steps.validate.status).toBe("completed");
    expect(loaded!.steps.validate.output).toBe("ok");
    expect(loaded!.currentStep).toBe("analyze");
  });
});
