import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the visual workbench shell and primary pipeline navigation", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /可视化工作台/ })).toBeInTheDocument();
    expect(screen.getByText(/本地控制面/)).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toHaveTextContent("源码");
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
