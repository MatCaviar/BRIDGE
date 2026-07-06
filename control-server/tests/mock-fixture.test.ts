import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseTargetSchema } from "../src/import/local-project-reader.js";
import { scanProject } from "../src/scanner/project-scanner.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");

describe("mock Android fixture", () => {
  it("indexes source operations without treating the schema example as source", async () => {
    const source = resolve(repositoryRoot, "control-server/tests/fixtures/mock-audio-android");
    const schema = parseTargetSchema(await readFile(resolve(repositoryRoot, "schema/mock-mcp-output.schema.json"), "utf8"));
    const index = await scanProject(source);

    expect(index.nodes.map((node) => node.label)).toEqual(expect.arrayContaining([
      "AudioControlManager", "AudioRpcProxy", "getAudioVolume", "setAudioVolume", "setAudioMute",
    ]));
    expect(index.evidence.map((item) => item.operation)).toEqual(expect.arrayContaining([
      "get_audio_volume", "set_audio_volume", "set_audio_mute",
    ]));
    expect(JSON.stringify(schema)).toContain("reference_weather_lookup");
    expect(index.nodes.some((node) => node.label === "reference_weather_lookup")).toBe(false);
  });
});
