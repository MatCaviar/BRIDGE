import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CurateStudio } from "./CurateStudio";
import { CommandCenter } from "./CommandCenter";
import * as state from "../state/workbench";

vi.mock("../state/workbench", async () => ({ ...(await vi.importActual("../state/workbench")), useWorkbench: vi.fn() }));
const useWorkbench = vi.mocked(state.useWorkbench);

beforeEach(() => { cleanup(); useWorkbench.mockReset(); delete window.bridge; });

describe("automatic Curate workflow", () => {
  it("confirms a non-empty selection as the only generation decision", async () => {
    const saveSelection = vi.fn().mockResolvedValue({ selected: ["get_audio_volume"] });
    Object.defineProperty(window, "bridge", { configurable: true, value: { saveSelection } });
    useWorkbench.mockReturnValue({
      project: { id: "p1", name: "Mock Audio" },
      artifacts: { capabilities: [{ id: "get_audio_volume", sourceRef: "AudioRpcProxy.kt:5", selected: true, mockExecutable: false, realExecutable: false }], },
      pipelineRun: { status: "awaiting_curate" }, refresh: vi.fn(), setError: vi.fn(),
    } as any);
    render(<CurateStudio />);

    fireEvent.click(screen.getByRole("button", { name: "确认并自动生成" }));
    await waitFor(() => expect(saveSelection).toHaveBeenCalledWith("p1", ["get_audio_volume"]));
  });

  it("shows retry from the failed stage without manual stage controls", async () => {
    const retryPipeline = vi.fn().mockResolvedValue(undefined);
    useWorkbench.mockReturnValue({
      project: { id: "p1", name: "Mock Audio" },
      pipelineRun: { status: "failed", failedStage: "wire_check", error: "wire mismatch" }, retryPipeline, cancelPipeline: vi.fn(),
    } as any);
    render(<CommandCenter />);

    const retry = screen.getByRole("button", { name: "从 wire_check 重试" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.click(retry);
    await waitFor(() => expect(retryPipeline).toHaveBeenCalledOnce());
  });
});
