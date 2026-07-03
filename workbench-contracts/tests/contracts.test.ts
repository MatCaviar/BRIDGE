import { describe, expect, it } from "vitest";
import { confirmationFor, pipelineStages } from "../src/index.js";

describe("workbench contracts", () => {
  it("keeps the BRIDGE stage order stable", () => {
    expect(pipelineStages.map((stage) => stage.id)).toEqual([
      "import",
      "analyze",
      "curate",
      "scaffold",
      "generate",
      "validate_config",
      "wire_check",
      "build",
      "test",
      "register",
      "verify",
      "schema_preview",
      "deploy",
    ]);
  });

  it("assigns typed confirmation to deploy and real MCP calls", () => {
    expect(confirmationFor("deploy")).toBe("typed-project-name");
    expect(confirmationFor("mcp_call_real")).toBe("typed-project-name");
    expect(confirmationFor("scan")).toBe("none");
  });
});
