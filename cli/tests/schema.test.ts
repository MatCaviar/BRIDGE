import { describe, expect, it } from "vitest";
import type { AnalysisData, CapabilityDef } from "../src/types.js";
import {
  bridgeFunctionArtifact,
  jsonSchemaFor,
  mcpToolArtifact,
  openAIToolArtifact,
} from "../src/commands/schema.js";

const readingLight: CapabilityDef = {
  id: "reading_light",
  domain: "vehicle",
  object: "reading_light",
  action: "set",
  safetyLevel: "normal",
  status: "verified",
  sourceRef: "CarLightService.kt:setReadingLight",
  description: "控制车内阅读灯的开关和亮度，提供乘客阅读时的局部照明。",
  params: [
    { name: "position", type: "List[str]", optional: true, enum: ["主驾", "副驾", "二排左", "二排右", "三排左", "三排右"], description: "灯光分区列表（支持多个）" },
    { name: "state", type: "List[str]", optional: true, enum: ["开", "关"], description: "与 position 一一对应" },
    { name: "brightness", type: "List[str]", optional: true, enum: ["柔和", "标准", "明亮"] },
    { name: "open_with_door", type: "List[str]", optional: true, enum: ["开", "关"] },
  ],
};

const analysis: AnalysisData = {
  app: { name: "vehicle-light", framework: "android-kotlin" },
  capabilities: [readingLight, { ...readingLight, id: "broken_light", status: "broken" }],
};

describe("upstream Agent function schema projection", () => {
  it("exports the requested name/arguments/options/description shape", () => {
    const artifact = bridgeFunctionArtifact(analysis) as { functions: Array<Record<string, any>> };
    const fn = artifact.functions.find((item) => item.name === "reading_light")!;
    expect(fn.description).toContain("阅读灯");
    expect(fn.arguments.position).toEqual(expect.objectContaining({
      type: "List[str]",
      required: false,
      options: ["主驾", "副驾", "二排左", "二排右", "三排左", "三排右"],
    }));
    expect(artifact.functions.some((item) => item.name === "broken_light")).toBe(false);
  });

  it("maps List[T] + options to a real array item enum in JSON Schema", () => {
    const schema = jsonSchemaFor(readingLight) as any;
    expect(schema.properties.position.type).toBe("array");
    expect(schema.properties.position.items).toEqual({
      type: "string",
      enum: ["主驾", "副驾", "二排左", "二排右", "三排左", "三排右"],
    });
    expect(schema.required).toBeUndefined();
  });

  it("keeps MCP and OpenAI envelopes aligned and adds four BRIDGE media tools", () => {
    const mcp = mcpToolArtifact(analysis) as { tools: Array<Record<string, any>> };
    const openai = openAIToolArtifact(analysis) as Array<Record<string, any>>;
    expect(mcp.tools).toHaveLength(5);
    expect(openai).toHaveLength(5);
    expect(openai[0].function.parameters).toEqual(mcp.tools[0].inputSchema);
    expect(mcp.tools[0].annotations.readOnlyHint).toBe(false);
  });

  it("normalizes numeric wire options to numeric JSON Schema enums", () => {
    const numeric = { ...readingLight, params: [{ name: "mode", type: "int", enum: ["0", "1", "2"] }] };
    const schema = jsonSchemaFor(numeric) as any;
    expect(schema.properties.mode).toEqual(expect.objectContaining({ type: "integer", enum: [0, 1, 2] }));
  });
});
