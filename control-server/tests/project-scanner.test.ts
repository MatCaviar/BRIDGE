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

  it("indexes TypeScript declarations, methods, dependencies, and RPC evidence without comment false positives", async () => {
    const root = await mkdtemp(join(tmpdir(), "bridge-typescript-scan-"));
    roots.push(root);
    await mkdir(join(root, "manager"), { recursive: true });
    await writeFile(join(root, "manager", "KaraokeManager.ts"), `
      import { BaseManager } from "./BaseManager";
      // class FakeFromComment { fakeMethod() {} }
      export interface SoundMode { level: number }
      export default class PublicController { setMicVol(volume: number) {} }
      class KaraokeManager extends BaseManager {
        public setMicVol(volume: number) {
          return this.iface.createMethodCallMessage("setMicVol");
        }
        private reset() {}
      }
      const fake = "class FakeFromString { fakeMethod() {} }";
    `);

    const result = await scanProject(root) as any;
    expect(result.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "SoundMode", symbolKind: "interface", line: expect.any(Number) }),
      expect.objectContaining({ label: "PublicController", symbolKind: "class", line: expect.any(Number) }),
      expect.objectContaining({ label: "KaraokeManager", symbolKind: "class", line: expect.any(Number) }),
      expect.objectContaining({ label: "setMicVol", symbolKind: "method", owner: "KaraokeManager", visibility: "public" }),
      expect.objectContaining({ label: "reset", symbolKind: "method", owner: "KaraokeManager", visibility: "private" }),
    ]));
    expect(result.nodes.some((node: any) => node.label === "FakeFromComment" || node.label === "FakeFromString")).toBe(false);
    expect(result.nodes.some((node: any) => node.symbolKind === "import")).toBe(false);
    expect(result.edges).toContainEqual(expect.objectContaining({ kind: "imports", to: "./BaseManager" }));
    expect(result.evidence).toContainEqual(expect.objectContaining({ operation: "setMicVol", transport: "dbus" }));
  });
});
