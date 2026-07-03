import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectImport } from "./ProjectImport";
import * as state from "../state/workbench";

vi.mock("../state/workbench", async () => ({ ...(await vi.importActual("../state/workbench")), useWorkbench: vi.fn() }));
const useWorkbench = vi.mocked(state.useWorkbench);

beforeEach(() => { cleanup(); useWorkbench.mockReset(); });

describe("ProjectImport local bridge", () => {
  it("selects native paths and imports without reading browser File objects", async () => {
    const setProject = vi.fn(); const setError = vi.fn();
    useWorkbench.mockReturnValue({ setProject, setError } as any);
    const bridge = {
      selectSourceDirectory: vi.fn().mockResolvedValue("D:/source/audio"),
      selectSchemaFile: vi.fn().mockResolvedValue("D:/schema.json"),
      importProject: vi.fn().mockResolvedValue({ id: "p1", name: "Audio" }),
    };
    Object.defineProperty(window, "bridge", { configurable: true, value: bridge });
    render(<ProjectImport />);
    fireEvent.change(screen.getByLabelText("项目名"), { target: { value: "Audio" } });
    fireEvent.click(screen.getByRole("button", { name: "选择源码目录" }));
    fireEvent.click(screen.getByRole("button", { name: "选择 Schema" }));
    await screen.findByText("D:/source/audio"); await screen.findByText("D:/schema.json");
    fireEvent.click(screen.getByRole("button", { name: "建立隔离工作区" }));
    await waitFor(() => expect(bridge.importProject).toHaveBeenCalledWith({ projectName: "Audio", sourceDirectory: "D:/source/audio", schemaPath: "D:/schema.json" }));
    expect(setProject).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
  });
});
