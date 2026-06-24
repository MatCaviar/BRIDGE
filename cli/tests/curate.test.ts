import { describe, it, expect } from "vitest";
import { enumerateCandidates } from "../src/commands/curate.js";
const A = { app:{name:"t",domain:"d",framework:"YunOS HDT",entryFile:"x"}, capabilities:[
  { id:"read_gear", domain:"v", object:"gear", action:"read_status", params:[{name:"x",type:"string"}], safetyLevel:"readonly", sdkCalls:[], sourceRef:"g.ts" },
  { id:"nav", domain:"ui", object:"page", action:"navigate_to", safetyLevel:"normal", sdkCalls:[], sourceRef:"n.ts" },
]};
describe("enumerateCandidates", () => {
  it("lists every capability", () => {
    const rows = enumerateCandidates(A as any);
    expect(rows.map(r=>r.id).sort()).toEqual(["nav","read_gear"]);
    expect(rows[0]).toMatchObject({ action_object:"read_status gear", safety:"readonly", paramCount:1 });
  });
  it("prd-hit when PRD mentions action/object", () => {
    const rows = enumerateCandidates(A as any, "users navigate_to pages");
    expect(rows.find(r=>r.id==="nav")!.prdHit).toContain("navigate_to");
  });
});
