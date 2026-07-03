# BRIDGE Local Electron Workbench Design

## Objective

Replace the Workbench HTTP control plane with a single-window local Electron application. The React interface retains project import, source visualization, Analyze, Curate, Pipeline execution, logs, artifact inspection, MCP startup, and mock/real calls, but no TCP listener, REST request, CORS policy, SSE stream, or browser URL is part of the final runtime.

The hard acceptance input is a source directory plus target schema. Importing `source_code/imaudio_app_code` must create a recoverable project, persist a semantic source index, visualize declarations and RPC evidence, and allow the user to continue into Analyze and Curate.

## Architecture

```text
React renderer
  -> window.bridge typed API
  -> contextBridge preload
  -> Electron ipcMain handlers
  -> WorkbenchService
      -> WorkspaceManager
      -> PipelineRunner
      -> ArtifactReader
      -> McpSessionManager
```

The renderer runs with `nodeIntegration: false`, `contextIsolation: true`, and sandboxing enabled. It never receives unrestricted filesystem or process primitives.

## Local API

The preload exposes a narrow structured API:

- `selectSourceDirectory()`
- `selectSchemaFile()`
- `importProject({ projectName, sourceDirectory, schemaPath })`
- `listProjects()` and `getProject(projectId)`
- `getSourceIndex(projectId)` and `getArtifacts(projectId)`
- `saveSelection(projectId, selected)`
- `runStage(projectId, stage, confirmation)`
- `getMcp(projectId)`, `startMcp`, `stopMcp`, and `callMcp`
- `subscribeProjectEvents(projectId, listener)`

IPC handlers validate project IDs, operation names, confirmations, schema paths, and workspace containment. Renderer-provided executable paths, command strings, arbitrary flags, and arbitrary output paths are rejected.

## Import flow

Electron's native dialog selects the source directory and schema file. The main process reads and filters supported source files directly, so the renderer never Base64-encodes an entire project. It applies the existing file-count, per-file, and total-size limits, parses standard or legacy adjacent-object schema input, and invokes `WorkspaceManager` with bounded content.

Import atomically writes source files, `target-mcp-schema.json`, `source-index.json`, and `project.json`. A successful import returns only after the source index is valid. Restarting the application recovers projects from disk.

## Execution flow

`WorkbenchService` owns one `PipelineRunner` per project and one shared `McpSessionManager`. UI stage calls use the same command allowlist, `shell: false`, timeout, confirmation, artifact postcondition, and persistent stage-store rules already implemented.

Analyze receives the source directory, deterministic source index, and target schema. Curate rejects capability IDs absent from `analysis.json`. Generate must map selected capabilities or explicitly defer them. Build and real MCP execution remain blocked by failed gates.

Events from `EventBus` are forwarded to the renderer through a single project-scoped IPC subscription. Subscription cleanup occurs when the renderer unsubscribes or its WebContents is destroyed.

## Lifecycle and resource safety

Only one BrowserWindow is created. Closing it stops active MCP sessions and terminates tracked pipeline child processes. No background service remains. DevTools do not open automatically. The existing Aether Canvas limits remain unchanged.

Development may use Vite middleware only as a build tool, not as the application data transport. The packaged and normal start path loads `ui/dist/index.html` from disk. No application TCP port is opened.

## Migration

Create a reusable `WorkbenchService` from the behavior currently embedded in `WorkbenchRouter`. Electron IPC and tests call this service directly. The old HTTP router, server entry, REST client, SSE client, port configuration, and `concurrently` startup path are removed after parity tests pass.

The React state provider switches from `fetch` and `EventSource` to `window.bridge`. UI components and normalized contracts remain reusable.

## Testing

- Service unit tests: import, project recovery, source index, Curate validation, stages, artifacts, and MCP lifecycle without HTTP.
- Preload/IPC tests: exact channel allowlist, argument validation, event subscription cleanup, and no arbitrary command surface.
- Renderer tests: use a mocked `window.bridge`; no `fetch` or `EventSource` dependency.
- Electron smoke: launch the app with `ELECTRON_DISABLE_GPU=1`, assert a window loads local `index.html`, and assert no Workbench TCP ports listen.
- Real input smoke: import `imaudio_app_code` with a schema and verify representative declarations/RPC evidence plus Analyze readiness.
- Existing deterministic CLI E2E continues to prove Scaffold, dependency install, TypeScript build, generated tests, and stdio server startup.

## Acceptance criteria

- Starting Workbench opens one local desktop window and no HTTP listener.
- Source directory and schema are selected through native dialogs or supplied to the service test API.
- Import does not load excluded binary resources into renderer memory.
- Semantic source visualization and pipeline state survive restart.
- All prior UI operations are available through typed IPC.
- Mock MCP calls use a real generated stdio server; real mode fails closed until gates pass.
- Closing the window leaves no Workbench process or MCP child running.
