import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AetherField } from "./AetherField";

afterEach(() => vi.restoreAllMocks());
describe("AetherField", () => {
  it("uses a static poster when reduced motion is requested", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<AetherField />);
    expect(screen.getByTestId("aether-poster")).toBeInTheDocument();
    expect(screen.queryByTestId("aether-canvas")).not.toBeInTheDocument();
  });
});
