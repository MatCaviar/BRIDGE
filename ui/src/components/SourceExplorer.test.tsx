import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SourceExplorer } from "./SourceExplorer";
import { CurateStudio } from "./CurateStudio";
import { TransformationMap } from "./TransformationMap";
import * as workbenchState from "../state/workbench";

vi.mock("../state/workbench", async () => {
  const actual = await vi.importActual<typeof import("../state/workbench")>("../state/workbench");
  return { ...actual, useWorkbench: vi.fn() };
});

const useWorkbench = vi.mocked(workbenchState.useWorkbench);

beforeEach(() => {
  cleanup();
  useWorkbench.mockReset();
});

describe("semantic source and execution truth", () => {
  it("counts declarations and shows RPC evidence without treating imports as interfaces", () => {
    useWorkbench.mockReturnValue({
      source: [
        { id: "file", path: "manager/Audio.ts", kind: "file", label: "Audio.ts" },
        { id: "class", path: "manager/Audio.ts", kind: "symbol", label: "Audio", symbolKind: "class", line: 2 },
        { id: "method", path: "manager/Audio.ts", kind: "symbol", label: "setMicVol", symbolKind: "method", owner: "Audio", line: 3 },
      ],
      sourceEdges: [{ from: "file", to: "./BaseManager", kind: "imports" }],
      sourceEvidence: [{ id: "rpc", path: "manager/Audio.ts", line: 4, operation: "setMicVol", transport: "dbus" }],
      sourceFindings: [],
    } as any);

    render(<SourceExplorer />);
    expect(screen.getByText("2 declarations")).toBeInTheDocument();
    expect(screen.getByText(/setMicVol · DBUS RPC/)).toBeInTheDocument();
    expect(screen.getByText("1 dependencies")).toBeInTheDocument();
    expect(screen.queryByText("./BaseManager", { selector: "b" })).not.toBeInTheDocument();
  });

  it("distinguishes mock readiness from real transport readiness", () => {
    useWorkbench.mockReturnValue({
      project: undefined,
      artifacts: { capabilities: [
        { id: "preview_sound", sourceRef: "Audio.ts:preview", selected: true, mockExecutable: true, realExecutable: false, blockedReason: "transport unavailable" },
        { id: "read_status", sourceRef: "Audio.ts:read", selected: true, mockExecutable: true, realExecutable: true },
      ] },
      refresh: vi.fn(),
      setError: vi.fn(),
    } as any);

    render(<CurateStudio />);
    expect(screen.getByText("MOCK READY · REAL BLOCKED")).toBeInTheDocument();
    expect(screen.getByText("transport unavailable")).toBeInTheDocument();
    expect(screen.getByText("REAL READY")).toBeInTheDocument();
  });

  it("shows mock and real readiness in the provenance chain", () => {
    useWorkbench.mockReturnValue({ artifacts: {
      capabilities: [{ id: "preview_sound", sourceRef: "Audio.ts:preview", selected: true }],
      tools: [{ name: "preview_sound", mockExecutable: true, realExecutable: false, blockedReason: "transport unavailable" }],
      rpc: [],
      edges: [],
    } } as any);
    render(<TransformationMap />);
    expect(screen.getByText("MOCK READY")).toBeInTheDocument();
    expect(screen.getByText("transport unavailable")).toBeInTheDocument();
  });
});
