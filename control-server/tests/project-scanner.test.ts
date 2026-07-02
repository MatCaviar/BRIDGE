import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanProject } from "../src/scanner/project-scanner.js";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("scanProject", () => {
  it("returns files and exported symbols without following hidden runtime directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-scan-"));
    roots.push(root);
    await mkdir(join(root, "src"), { recursive: true });
    await mkdir(join(root, "node_modules", "ignored"), { recursive: true });
    await writeFile(join(root, "src", "service.ts"), 'import car from "@yunos/car";\nexport async function readStatus() { return car.read(); }');
    await writeFile(join(root, "node_modules", "ignored", "index.ts"), "export const hidden = true;");
    const result = await scanProject(root);
    expect(result.nodes.some((node) => node.path === "src/service.ts" && node.kind === "file")).toBe(true);
    expect(result.nodes.some((node) => node.label === "readStatus" && node.symbolKind === "function")).toBe(true);
    expect(result.nodes.some((node) => node.path.includes("node_modules"))).toBe(false);
  });

  it("discovers Kotlin classes/functions and AIDL interfaces", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-android-scan-"));
    roots.push(root);
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "src", "LightController.kt"), "class LightController {\n  fun turnOnLight(): Boolean = true\n  override fun closeLight() {}\n}");
    await writeFile(join(root, "src", "ILightService.aidl"), "interface ILightService {\n  boolean setReadingLight(in String state);\n}");
    const result = await scanProject(root);
    expect(result.nodes.some((node) => node.label === "LightController" && node.symbolKind === "class")).toBe(true);
    expect(result.nodes.some((node) => node.label === "turnOnLight" && node.symbolKind === "method")).toBe(true);
    expect(result.nodes.some((node) => node.label === "ILightService" && node.symbolKind === "class")).toBe(true);
    expect(result.nodes.some((node) => node.label === "setReadingLight" && node.symbolKind === "method")).toBe(true);
  });
});
