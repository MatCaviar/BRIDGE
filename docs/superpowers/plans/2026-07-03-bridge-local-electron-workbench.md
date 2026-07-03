# BRIDGE Local Electron Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the interactive Workbench while replacing all HTTP transport with a local Electron IPC runtime.

**Architecture:** Move orchestration out of `WorkbenchRouter` into a protocol-neutral `WorkbenchService`. Expose only typed service operations through a sandboxed Electron preload bridge; React consumes that bridge and the packaged runtime loads local Vite assets from disk.

**Tech Stack:** Electron, React, TypeScript, Node.js, Vitest, MCP stdio SDK.

---

### Task 1: Protocol-neutral WorkbenchService

**Files:**
- Create: `control-server/src/service/workbench-service.ts`
- Create: `control-server/src/import/local-project-reader.ts`
- Test: `control-server/tests/workbench-service.test.ts`
- Reuse: `control-server/src/import/workspace-manager.ts`, `control-server/src/pipeline/pipeline-runner.ts`

- [ ] Write a failing test that imports a source directory and adjacent-object schema by path, lists the recovered project, reads `SourceIndex`, rejects unknown Curate IDs, and subscribes to project events.
- [ ] Run `npm test --prefix control-server -- workbench-service.test.ts` and confirm the service is missing.
- [ ] Implement source filtering and schema parsing in the main process with the same limits used by `WorkspaceManager`.
- [ ] Implement methods `ready`, `importFromPaths`, `listProjects`, `getProject`, `getSourceIndex`, `getArtifacts`, `saveSelection`, `runStage`, and MCP lifecycle/call methods.
- [ ] Re-run the focused test and commit `fix(workbench): extract protocol-neutral local service`.

The service API uses structured values only:

```ts
interface LocalImportRequest { projectName: string; sourceDirectory: string; schemaPath: string }
interface ProjectSubscription { unsubscribe(): void }
```

### Task 2: Electron IPC boundary

**Files:**
- Create: `desktop/src/channels.ts`
- Create: `desktop/src/main.ts`
- Create: `desktop/src/preload.ts`
- Create: `desktop/src/register-ipc.ts`
- Create: `desktop/tsconfig.json`
- Test: `desktop/tests/register-ipc.test.ts`

- [ ] Write a failing test with fake `ipcMain`, dialog, and service objects; assert only declared channels register and unknown operation/path values never reach process execution.
- [ ] Run `npm test --prefix desktop` and confirm the desktop package does not exist.
- [ ] Implement one handler per typed operation and project-scoped event forwarding with cleanup on WebContents destruction.
- [ ] Configure BrowserWindow with `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, one window, no automatic DevTools, and local `ui/dist/index.html` loading.
- [ ] Re-run tests and commit `feat(workbench): add sandboxed Electron IPC runtime`.

### Task 3: Renderer bridge and native import

**Files:**
- Create: `ui/src/bridge/types.ts`
- Create: `ui/src/bridge/client.ts`
- Modify: `ui/src/state/workbench.tsx`
- Modify: `ui/src/components/ProjectImport.tsx`
- Delete: `ui/src/api/client.ts`
- Delete: `ui/src/api/events.ts`
- Test: `ui/src/App.test.tsx`
- Test: `ui/src/components/ProjectImport.test.tsx`

- [ ] Write failing tests that install a mocked `window.bridge`, select source/schema paths, import, refresh, run a stage, and receive a pushed event without `fetch` or `EventSource`.
- [ ] Run focused UI tests and confirm they fail against the REST client.
- [ ] Implement the typed bridge client and change state/event subscriptions to IPC.
- [ ] Replace browser directory/file inputs with native-selection buttons and path summaries; renderer never reads source file contents.
- [ ] Re-run all UI tests and commit `fix(workbench): move renderer operations to local IPC`.

### Task 4: Remove HTTP runtime and update startup

**Files:**
- Delete: `control-server/src/http/router.ts`
- Delete: `control-server/src/server.ts`
- Delete: `control-server/src/start.ts`
- Delete: `control-server/tests/http-api.test.ts`
- Modify: `control-server/src/config.ts`
- Modify: `package.json`
- Modify: `scripts/start-workbench.ps1`
- Modify: `docs/WORKBENCH.md`

- [ ] Add a manifest/startup test asserting no script contains `43140`, `43141`, `workbench:api`, `fetch`, or `EventSource` in the final runtime path.
- [ ] Confirm the test fails before deletion.
- [ ] Add desktop workspace scripts for build, test, dev, and start; build UI then Electron and run Electron directly.
- [ ] Remove HTTP-only configuration and dependencies, and document that no TCP port is opened.
- [ ] Re-run manifest, service, UI, and desktop tests; commit `refactor(workbench): remove HTTP control plane`.

### Task 5: Real input and local executable verification

**Files:**
- Modify: `scripts/smoke-imaudio-workbench.mjs`
- Create: `desktop/tests/local-workbench-smoke.test.ts`
- Modify: `docs/WORKBENCH.md`

- [ ] Write a failing smoke test that imports `imaudio_app_code` plus schema through `WorkbenchService` and asserts recovered project metadata, `KaraokeManager`, `setMicVol`, `IMAudioProxy`, and `querySoundLibrary` evidence.
- [ ] Add a desktop launch smoke using `ELECTRON_DISABLE_GPU=1`; assert local HTML loads and no Workbench listener exists.
- [ ] Run `npm run workbench:test`, `npm run workbench:build`, the real-input smoke, CLI E2E, and plugin validation.
- [ ] Commit `test(workbench): prove no-http local workflow`.
