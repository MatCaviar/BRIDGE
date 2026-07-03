# Source-First MCP Auto Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make source analysis the sole origin of MCP candidates, pause only for Curate, then automatically produce and mock-verify a generated MCP suite using a dedicated miniature Android fixture.

**Architecture:** A focused `AutoPipelineCoordinator` in the Electron main-process service persists automation state, executes Analyze and post-Curate stages, and stops on the first failure. The renderer observes typed IPC state and only submits Curate, retry, or cancel actions. Imported schema content is treated strictly as an output-format reference, never as a target tool catalog.

**Tech Stack:** TypeScript, Node.js, Electron IPC/contextBridge, React, Vitest, Kotlin/AIDL fixture, existing `mcp-pipeline` CLI.

---

### Task 1: Add the miniature Android source and schema fixture

**Files:**
- Create: `source_code/mock-audio-android/settings.gradle.kts`
- Create: `source_code/mock-audio-android/build.gradle.kts`
- Create: `source_code/mock-audio-android/app/src/main/AndroidManifest.xml`
- Create: `source_code/mock-audio-android/app/src/main/aidl/com/example/mockaudio/IAudioControl.aidl`
- Create: `source_code/mock-audio-android/app/src/main/java/com/example/mockaudio/AudioControlManager.kt`
- Create: `source_code/mock-audio-android/app/src/main/java/com/example/mockaudio/AudioRpcProxy.kt`
- Create: `source_code/mock-audio-android/README.md`
- Create: `schema/mock-mcp-output.schema.json`
- Modify: `control-server/src/scanner/project-scanner.ts`
- Test: `control-server/tests/mock-fixture.test.ts`

- [ ] **Step 1: Write a failing fixture contract test**

```ts
it("indexes the mock Android operations without treating the schema example as source", async () => {
  const source = resolve(repositoryRoot, "source_code/mock-audio-android");
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
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test --prefix control-server -- mock-fixture.test.ts`

Expected: FAIL because the fixture files do not exist.

- [ ] **Step 3: Add the minimal fixture**

The AIDL contract declares `getAudioVolume`, `setAudioVolume`, and `setAudioMute`. `AudioControlManager.kt` exposes only those three public operations. `AudioRpcProxy.kt` calls a small private `transact(operation, payload)` helper with literal wire names:

```kotlin
fun getAudioVolume(zone: String): Int = transact("get_audio_volume", mapOf("zone" to zone)) as Int
fun setAudioVolume(zone: String, level: Int): Boolean = transact("set_audio_volume", mapOf("zone" to zone, "level" to level)) as Boolean
fun setAudioMute(zone: String, muted: Boolean): Boolean = transact("set_audio_mute", mapOf("zone" to zone, "muted" to muted)) as Boolean
```

The schema is a JSON Schema for a generated MCP tool list and contains one example named `reference_weather_lookup`; it contains no audio target names.

- [ ] **Step 4: Extend deterministic RPC evidence extraction**

In `project-scanner.ts`, extract Kotlin/Java calls matching `transact("<operation>"` as `aidl` evidence and AIDL method declarations as `aidl` evidence. Deduplicate by path, operation, and line.

- [ ] **Step 5: Run the focused and scanner tests**

Run: `npm test --prefix control-server -- mock-fixture.test.ts project-scanner.test.ts`

Expected: both test files PASS and exactly the three audio wire operations are found.

- [ ] **Step 6: Commit**

```powershell
git add source_code/mock-audio-android schema/mock-mcp-output.schema.json control-server/src/scanner/project-scanner.ts control-server/tests/mock-fixture.test.ts
git commit -m "test(workbench): add source-first Android fixture"
```

### Task 2: Make imported schemas format references, not target catalogs

**Files:**
- Modify: `control-server/src/pipeline/pipeline-runner.ts`
- Modify: `control-server/src/artifacts/artifact-reader.ts`
- Modify: `workbench-contracts/src/index.ts`
- Modify: `control-server/tests/pipeline-runner.test.ts`
- Modify: `control-server/tests/artifact-reader.test.ts`

- [ ] **Step 1: Write failing source-first semantics tests**

Add assertions that the Analyze prompt calls the schema an `output-format reference`, explicitly prohibits deriving candidate names from it, and does not mention target-only gaps:

```ts
expect(prompt).toContain("output-format reference");
expect(prompt).toContain("Never create a capability from a schema example");
expect(prompt).not.toContain("target-only APIs as gaps");
```

Change the artifact test so a schema example named `reference_weather_lookup` yields no target projections and no missing-target finding:

```ts
expect(result.targets).toEqual([]);
expect(result.coverage.targeted).toBe(0);
expect(result.findings.join(" ")).not.toMatch(/reference_weather_lookup|no source-backed capability/i);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test --prefix control-server -- pipeline-runner.test.ts artifact-reader.test.ts`

Expected: FAIL because the prompt and artifact projections still treat schema names as targets.

- [ ] **Step 3: Implement source-first semantics**

Update the Analyze prompt to say:

```text
Use the imported schema only as an output-format reference. Never create a capability from a schema example or report an example as missing. Discover candidates exclusively from verified live source evidence.
```

Remove target-name matching and missing-target findings from `readArtifacts`. Keep the deprecated `targets` and `targeted/matched` fields as empty/zero for wire compatibility during this release. Coverage remains `discovered`, `selected`, `projected`, and `wired`.

- [ ] **Step 4: Run focused tests**

Run: `npm test --prefix control-server -- pipeline-runner.test.ts artifact-reader.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add control-server/src/pipeline/pipeline-runner.ts control-server/src/artifacts/artifact-reader.ts workbench-contracts/src/index.ts control-server/tests
git commit -m "fix(workbench): make capability discovery source-first"
```

### Task 3: Add the persistent automatic pipeline coordinator

**Files:**
- Modify: `workbench-contracts/src/index.ts`
- Create: `control-server/src/pipeline/auto-run-store.ts`
- Create: `control-server/src/pipeline/auto-pipeline.ts`
- Test: `control-server/tests/auto-pipeline.test.ts`

- [ ] **Step 1: Define the public automation contract in a failing test**

```ts
expect(await coordinator.startAnalysis(context, execute)).toMatchObject({ status: "awaiting_curate" });
expect(await coordinator.continueAfterCurate(context, execute)).toMatchObject({ status: "mock_ready" });
expect(calls).toEqual(["analyze", "scaffold", "generate", "validate_config", "wire_check", "test", "build", "schema_preview", "verify"]);
```

Add a failure case where `wire_check` throws, assert that `test` is never called, then retry and assert execution resumes at `wire_check`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test --prefix control-server -- auto-pipeline.test.ts`

Expected: FAIL because `AutoPipelineCoordinator` does not exist.

- [ ] **Step 3: Add typed state and stage order**

In contracts define:

```ts
export type PipelineAutomationStatus = "analyzing" | "awaiting_curate" | "running" | "failed" | "mock_ready" | "cancelled";
export interface PipelineAutomationRun {
  readonly projectId: string;
  readonly status: PipelineAutomationStatus;
  readonly activeStage?: PipelineStageId;
  readonly failedStage?: PipelineStageId;
  readonly error?: string;
  readonly startedAt: string;
  readonly updatedAt: string;
}
export const automaticPostCurateStages = ["scaffold", "generate", "validate_config", "wire_check", "test", "build", "schema_preview", "verify"] as const;
```

Add `"pipeline"` to `WorkbenchEvent["type"]`.

- [ ] **Step 4: Implement atomic persistence and coordination**

`AutoRunStore` writes `.workbench/auto-run.json` through a temporary file plus rename. `AutoPipelineCoordinator` owns one `AbortController` per project, persists every transition, publishes a `pipeline` event, stops on the first exception, and passes `{ confirmed: true }` to automatic post-Curate stages. `cancel` aborts only the current run. `retry` starts at `failedStage` and does not rerun prior passed stages.

- [ ] **Step 5: Make mock verification independent of gateway registration**

In `pipeline-runner.ts`, change the `verify` prerequisite from `register` to `build`. Registration remains manual and is not part of `automaticPostCurateStages`.

- [ ] **Step 6: Run coordinator and runner tests**

Run: `npm test --prefix control-server -- auto-pipeline.test.ts pipeline-runner.test.ts`

Expected: PASS, including stop-on-failure and retry-from-failure.

- [ ] **Step 7: Commit**

```powershell
git add workbench-contracts/src/index.ts control-server/src/pipeline control-server/tests/auto-pipeline.test.ts control-server/tests/pipeline-runner.test.ts
git commit -m "feat(workbench): add automatic pipeline coordinator"
```

### Task 4: Integrate automation into the local service and Electron IPC

**Files:**
- Modify: `control-server/src/service/workbench-service.ts`
- Modify: `control-server/tests/workbench-service.test.ts`
- Modify: `desktop/src/register-ipc.ts`
- Modify: `desktop/tests/register-ipc.test.ts`
- Modify: `desktop/preload.cjs`
- Modify: `ui/src/bridge/types.ts`
- Modify: `ui/src/bridge/client.ts`

- [ ] **Step 1: Write failing service integration tests**

Inject a fake stage executor/coordinator dependency and assert:

```ts
const project = await service.importFromPaths(request);
await eventually(() => expect(service.getPipelineRun(project.id)).resolves.toMatchObject({ status: "awaiting_curate" }));
await service.saveSelection(project.id, ["get_audio_volume"]);
await eventually(() => expect(service.getPipelineRun(project.id)).resolves.toMatchObject({ status: "mock_ready" }));
```

Add tests that empty Curate selection is rejected and retry/cancel are routed to the coordinator.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test --prefix control-server -- workbench-service.test.ts`

Expected: FAIL because import does not start Analyze and no automation methods exist.

- [ ] **Step 3: Integrate the coordinator**

After persisting an imported project, schedule `startAnalysis` without blocking the import response. `saveSelection` validates a non-empty set, writes `selection.json`, records Curate passed, and schedules `continueAfterCurate`. Add:

```ts
getPipelineRun(projectId: string): Promise<PipelineAutomationRun | undefined>
retryPipeline(projectId: string): Promise<PipelineAutomationRun>
cancelPipeline(projectId: string): Promise<PipelineAutomationRun>
```

Pass the coordinator an internal executor that calls `PipelineRunner.runStage(..., signal)`. Cancel active runs during `shutdown`.

- [ ] **Step 4: Add IPC allowlist methods**

Add `bridge:get-pipeline`, `bridge:retry-pipeline`, and `bridge:cancel-pipeline` handlers, preload methods, bridge types, and client methods. Do not expose executable names, command arguments, or arbitrary paths.

- [ ] **Step 5: Run service and desktop tests**

Run these commands sequentially:

```powershell
npm test --prefix control-server -- workbench-service.test.ts
npm test --prefix desktop -- register-ipc.test.ts no-http-runtime.test.ts
```

Expected: PASS and the no-HTTP test remains green.

- [ ] **Step 6: Commit**

```powershell
git add control-server/src/service control-server/tests/workbench-service.test.ts desktop ui/src/bridge
git commit -m "feat(workbench): automate pipeline over local IPC"
```

### Task 5: Make Curate the only normal UI pause

**Files:**
- Modify: `ui/src/state/workbench.tsx`
- Modify: `ui/src/components/ProjectImport.tsx`
- Modify: `ui/src/components/CurateStudio.tsx`
- Modify: `ui/src/components/CommandCenter.tsx`
- Modify: `ui/src/components/PipelineCanvas.tsx`
- Modify: `ui/src/components/CoverageDashboard.tsx`
- Modify: `ui/src/App.test.tsx`
- Create: `ui/src/components/CurateStudio.test.tsx`

- [ ] **Step 1: Write failing UI behavior tests**

Test that Curate is disabled outside `awaiting_curate`, rejects an empty selection, and labels its action `确认并自动生成`. Test that a failed run shows `Retry from wire_check` and does not expose manual Scaffold/Generate/Test buttons.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `npm test --prefix ui -- CurateStudio.test.tsx App.test.tsx`

Expected: FAIL because the UI still provides manual stage controls and does not read automation state.

- [ ] **Step 3: Add automation state to the provider**

Load `getPipelineRun` during refresh, refresh on `pipeline` events, and expose `pipelineRun`, `retryPipeline`, and `cancelPipeline`. Derive busy/active presentation from `pipelineRun.activeStage` rather than renderer-owned stage chaining.

- [ ] **Step 4: Update interaction components**

After import, explain that Analyze is running automatically. Curate accepts only a non-empty selection while status is `awaiting_curate`; confirmation invokes `saveSelection` once. Repurpose `CommandCenter` to show automation status, cancel while running, and retry only after failure. Remove ordinary manual downstream stage controls. `PipelineCanvas` highlights `activeStage`. Coverage labels reference source-discovered/projected/wired counts and no longer describes schema examples as targets.

- [ ] **Step 5: Run all UI tests**

Run: `npm test --prefix ui`

Expected: all UI tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add ui/src
git commit -m "feat(workbench): make Curate the sole pipeline pause"
```

### Task 6: Add an end-to-end mock fixture smoke and documentation

**Files:**
- Create: `scripts/smoke-mock-workbench.mjs`
- Modify: `docs/WORKBENCH.md`
- Modify: `package.json`

- [ ] **Step 1: Write the smoke script against the public service API**

The script imports `source_code/mock-audio-android` with `schema/mock-mcp-output.schema.json`, waits for `awaiting_curate`, asserts the three analyzed source capabilities and absence of `reference_weather_lookup`, saves two selected capabilities, waits for `mock_ready`, and checks generated `dist/index.js` plus tools schema.

Add root command:

```json
"workbench:smoke:mock": "node scripts/smoke-mock-workbench.mjs"
```

- [ ] **Step 2: Run the smoke and fix only integration defects it exposes**

Run these commands sequentially:

```powershell
npm run workbench:build
npm run workbench:smoke:mock
```

Expected: PASS with a JSON summary showing `sourceCandidates: 3`, `selected: 2`, `schemaReferenceLeak: false`, and `status: "mock_ready"`.

- [ ] **Step 3: Document the fast visual workflow**

In `docs/WORKBENCH.md`, list the exact fixture paths, explain that schema examples are format references, and document that Curate is the only pause. Include the smoke command and failure/retry behavior.

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm run workbench:test
npm run workbench:build
npm test --prefix cli -- e2e.test.ts
npm run workbench:smoke:mock
node scripts\smoke-imaudio-workbench.mjs source_code\imaudio_app_code schema\schema.json
npm run test:smoke --prefix desktop
git diff --check
```

Expected: all commands PASS; Electron smoke runs in the normal Windows user session; no HTTP listener is created.

- [ ] **Step 5: Commit**

```powershell
git add scripts/smoke-mock-workbench.mjs docs/WORKBENCH.md package.json
git commit -m "docs(workbench): add automatic fixture workflow"
```
