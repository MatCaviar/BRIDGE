#!/usr/bin/env node
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createConfig } from "../control-server/dist/config.js";
import { WorkbenchService } from "../control-server/dist/service/workbench-service.js";

const sourceDirectory = resolve(process.argv[2] ?? "source_code/imaudio_app_code");
const schemaPath = resolve(process.argv[3] ?? "schema/schema.json");
await access(sourceDirectory).catch(() => { throw new Error(`imaudio source directory not found: ${sourceDirectory}`); });
await access(schemaPath).catch(() => { throw new Error(`schema file not found: ${schemaPath}`); });
const runtimeRoot = await mkdtemp(resolve(tmpdir(), "bridge-imaudio-local-"));
const service = new WorkbenchService(createConfig({ runtimeRoot, repositoryRoot: resolve(".") }), { autoStartAnalysis: false });

try {
  const project = await service.importFromPaths({ projectName: "imaudio-local-smoke", sourceDirectory, schemaPath });
  const index = await service.getSourceIndex(project.id);
  const requiredDeclarations = ["KaraokeManager", "setMicVol", "IMAudioProxy"];
  const missingDeclarations = requiredDeclarations.filter((label) => !index.nodes.some((node) => node.kind === "symbol" && node.label === label));
  if (missingDeclarations.length) throw new Error(`Missing source declarations: ${missingDeclarations.join(", ")}`);
  if (!index.evidence.some((item) => item.operation === "querySoundLibrary")) throw new Error("Missing RPC evidence: querySoundLibrary");
  if (index.nodes.some((node) => node.symbolKind === "import")) throw new Error("Imports were incorrectly projected as interface declarations");
  const recovered = new WorkbenchService(createConfig({ runtimeRoot, repositoryRoot: resolve(".") }), { autoStartAnalysis: false });
  await recovered.ready();
  if (!(await recovered.listProjects()).some((candidate) => candidate.id === project.id)) throw new Error("Imported project was not recovered after service restart");
  process.stdout.write(`${JSON.stringify({
    transport: "local-service-no-http",
    projectId: project.id,
    importedSourceFiles: index.nodes.filter((node) => node.kind === "file").length,
    declarations: index.nodes.filter((node) => node.kind === "symbol").length,
    dependencies: index.edges.filter((edge) => edge.kind === "imports").length,
    rpcEvidence: index.evidence.length,
    verified: [...requiredDeclarations, "querySoundLibrary", "project-recovery"],
  }, null, 2)}\n`);
} finally {
  await service.shutdown();
  await rm(runtimeRoot, { recursive: true, force: true });
}
