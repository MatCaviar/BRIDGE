import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";

export type StepName =
  | "validate"
  | "validate_config"
  | "wire_check"
  | "analyze"
  | "scaffold"
  | "generate"
  | "test"
  | "build"
  | "register"
  | "verify";

export type StepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped";

export interface StepState {
  readonly status: StepStatus;
  readonly timestamp: string;
  readonly output: string | null;
  readonly approved: boolean;
  readonly error: string | null;
}

export interface PipelineState {
  readonly app: string;
  readonly appPath: string;
  readonly currentStep: StepName | "done";
  readonly steps: Record<StepName, StepState>;
}

const PIPELINE_DIR = ".mcp-pipeline";

const ALL_STEPS: StepName[] = [
  "validate", "analyze", "scaffold", "generate",
  "test", "build", "register", "verify",
];

function initialStepState(): Record<StepName, StepState> {
  const steps: Partial<Record<StepName, StepState>> = {};
  const now = new Date().toISOString();
  for (const step of ALL_STEPS) {
    steps[step] = {
      status: "pending",
      timestamp: now,
      output: null,
      approved: false,
      error: null,
    };
  }
  return steps as Record<StepName, StepState>;
}

export function createInitialState(appName: string, appPath: string): PipelineState {
  return {
    app: appName,
    appPath: appPath,
    currentStep: "validate",
    steps: initialStepState(),
  };
}

export function stateFilePath(appName: string, baseDir?: string): string {
  const dir = baseDir ? resolve(baseDir, PIPELINE_DIR, appName) : resolve(PIPELINE_DIR, appName);
  return resolve(dir, "state.json");
}

export function readState(appName: string, baseDir?: string): PipelineState | null {
  const path = stateFilePath(appName, baseDir);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw) as PipelineState;
}

export function writeState(state: PipelineState, baseDir?: string): void {
  const path = stateFilePath(state.app, baseDir);
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(state, null, 2), "utf-8");
}

export function updateStep(
  state: PipelineState,
  step: StepName,
  update: Partial<Pick<StepState, "status" | "output" | "approved" | "error">>,
): PipelineState {
  const current = state.steps[step];
  const updatedStep: StepState = {
    ...current,
    ...update,
    timestamp: new Date().toISOString(),
  };

  const stepIndex = ALL_STEPS.indexOf(step);
  const isLinear = stepIndex !== -1;  // validate_config/wire_check are inline sub-steps, not linear phases
  const nextStepIndex = stepIndex + 1;
  const isDone = isLinear && update.status === "completed" && nextStepIndex >= ALL_STEPS.length;
  const currentStep = !isLinear ? state.currentStep
    : isDone ? "done"
    : update.status === "completed" ? ALL_STEPS[nextStepIndex]
    : state.currentStep;

  return {
    ...state,
    currentStep,
    steps: { ...state.steps, [step]: updatedStep },
  };
}
