import { resolve } from "node:path";

export interface ImportLimits {
  readonly maxFiles: number;
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export interface ControlServerConfig {
  readonly runtimeRoot: string;
  readonly repositoryRoot: string;
  readonly codexExecutable: string;
  readonly importLimits: ImportLimits;
}

export function createConfig(overrides: Partial<ControlServerConfig> = {}): ControlServerConfig {
  return {
    runtimeRoot: resolve(".workbench-runtime"),
    repositoryRoot: resolve("."),
    codexExecutable: process.env.CODEX_EXECUTABLE ?? "codex",
    importLimits: { maxFiles: 5_000, maxFileBytes: 5 * 1024 * 1024, maxTotalBytes: 100 * 1024 * 1024 },
    ...overrides,
  };
}
