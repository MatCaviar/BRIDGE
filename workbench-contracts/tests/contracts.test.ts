import { describe, expect, it } from "vitest";
import { automaticPostCurateStages, confirmationFor, pipelineStages, safeProjectId } from "../src/index.js";

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

  // deploy writes outside the runtime root (to a sibling of the original source), so it must stay a
  // manual, typed-confirmed step — never part of the automatic post-curate sequence.
  it("keeps deploy out of the automatic post-curate sequence", () => {
    expect(automaticPostCurateStages).not.toContain("deploy");
    expect(automaticPostCurateStages).toEqual(["scaffold", "generate", "validate_config", "wire_check", "build", "test", "schema_preview", "verify"]);
  });

  it("derives a stable filesystem-safe slug for project names", () => {
    expect(safeProjectId("Local Audio")).toBe("local-audio");
    expect(safeProjectId("YunOS HDT 通信")).toBe("yunos-hdt");
    expect(safeProjectId("!!!")).toBe("project");
    expect(safeProjectId("A".repeat(60))).toHaveLength(48);
  });
});
