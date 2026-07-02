# BRIDGE Visual Workbench Design

## 1. Purpose

Build a local visual workbench for the BRIDGE pipeline. The workbench must show how application source code becomes a curated, generated, validated, runnable, and optionally deployed MCP suite. It is not merely a command launcher: every major transformation must remain inspectable from source reference through runtime MCP operation.

The first release runs only on `127.0.0.1`. It accepts project source plus a user-supplied target MCP schema, validates the pipeline's intermediate analysis with the repository's `schema/analysis.schema.json`, and can execute the complete BRIDGE pipeline under explicit command policy.

## 2. Product Principles

- Preserve provenance: every MCP tool must trace back to a source interface.
- Prefer deterministic artifacts over opaque UI state.
- Keep generation inspectable and reproducible.
- Fail closed at import, validation, command, safety, and deployment boundaries.
- Make the visual language expressive without exhausting the host machine.
- Never accept arbitrary shell commands from the browser.

## 3. Information Architecture

### 3.1 Hero and project overview

The entry view uses the Aether Dynamics visual language: a near-black background, purple glass surfaces, bounded content, fine gradient borders, restrained glow, and a technical particle field. The hero introduces Code Agent Suite BRIDGE and summarizes the active project's pipeline state.

The visual background uses a resource-bounded renderer:

- maximum 45 FPS;
- device-pixel ratio capped at 1.5;
- animation paused while the page is hidden;
- reduced-motion and low-power fallbacks;
- CSS dot-matrix poster fallback when Canvas/WebGL is unavailable;
- no preview or browser process is started automatically by repository scripts.

### 3.2 Source Explorer

Shows the imported project as:

- searchable file tree;
- module and service dependency graph;
- entry points, manifests, SDK imports, and service-layer functions;
- source preview with highlighted interface declarations and SDK calls.

Clicking a source node selects all downstream capabilities derived from it.

### 3.3 Capability Discovery

Presents every discovered upper-level interface with:

- stable capability ID;
- source reference;
- domain, object, and action;
- parameters and returns;
- SDK calls;
- proposed safety level;
- discovery confidence and validation state;
- exclusion reason when the interface is not MCP-eligible.

The view supports grouping by domain, source module, safety level, and eligibility.

### 3.4 Curate Studio

Provides interactive selection before generation:

- select or exclude individual capabilities;
- bulk actions by domain, source module, or safety level;
- filters for readonly, state-changing, device-dependent, and incomplete capabilities;
- visible reason and downstream impact for every exclusion;
- live selected-tool count and coverage indicators;
- persisted output in `selection.json`.

Curate edits selection only. It does not silently rewrite the source-derived analysis.

### 3.5 Transformation Map

Visualizes the primary provenance chain:

```text
sourceRef
  -> capability.id
  -> selection state
  -> MCP tool name and input schema
  -> adapter method
  -> RPC operation
  -> runtime verification status
```

Each stage exposes its artifact and validation result. Missing mappings appear as explicit gaps rather than disappearing from the graph.

### 3.6 Pipeline Canvas

Displays the BRIDGE stages and their dependencies:

```text
Import -> Analyze -> Curate -> Scaffold -> Generate
                                      -> Validate Config
                                      -> Wire Check
           -> Test -> Build -> Register -> Verify -> Deploy
```

Nodes show pending, running, passed, failed, skipped, or blocked states. Edges animate only while work is active. Selecting a node opens its inputs, outputs, duration, command policy, logs, and produced artifacts.

### 3.7 MCP Suite Explorer and Playground

Shows the generated MCP suite and acts as a real MCP client:

- launch and stop the generated MCP Server;
- execute `initialize`, `tools/list`, and `tools/call`;
- inspect tool input schemas and annotations;
- fill tool arguments through schema-derived forms;
- display raw JSON-RPC request and response data;
- show latency, errors, safety decisions, and device/RPC status;
- clearly distinguish mock and real-device execution.

The Playground binds to the active generated project in the first release. Arbitrary external MCP servers are out of scope.

### 3.8 Artifact Inspector and Coverage Dashboard

The Artifact Inspector provides linked views for:

- uploaded target MCP schema;
- `analysis.json`;
- `selection.json`;
- `rpc/config.json`;
- generated MCP tool schemas and source files;
- tests, build output, and verification reports.

The dashboard reports:

- interfaces scanned and discovered;
- eligible and excluded capabilities;
- Curate selection rate;
- generated tool count;
- adapter and RPC wiring coverage;
- validation, wire-check, test, and build status;
- MCP discovery and call status;
- device reachability and deployment status.

## 4. Architecture

### 4.1 Frontend

Create a dedicated React + Vite application under `ui/`.

Primary modules:

- `ProjectImport`
- `HeroOverview`
- `SourceExplorer`
- `CapabilityDiscovery`
- `CurateStudio`
- `TransformationMap`
- `PipelineCanvas`
- `CommandCenter`
- `McpPlayground`
- `ArtifactInspector`
- `CoverageDashboard`
- `LogTerminal`

The frontend communicates only with the local control service. It never spawns processes or reads arbitrary filesystem paths directly.

### 4.2 Local control service

Create a dedicated Node service under `control-server/`, bound exclusively to `127.0.0.1`.

Primary modules:

- `WorkspaceManager`: creates isolated imported-project workspaces.
- `ImportValidator`: validates archives, directory selections, schema files, limits, and traversal.
- `ProjectScanner`: reads source structure and pipeline artifacts.
- `PipelineAdapter`: invokes approved BRIDGE CLI operations.
- `CommandPolicy`: maps operations to confirmation requirements.
- `ProcessRunner`: executes binaries without a shell and streams bounded output.
- `StateReader`: normalizes `.mcp-pipeline` state and artifact status.
- `McpSessionManager`: manages real stdio MCP sessions.
- `EventStream`: emits state, logs, MCP events, and process completion through SSE.

### 4.3 Stable data model

The service exposes normalized entities with stable IDs:

- project;
- source file and source symbol;
- capability;
- selection;
- generated tool;
- adapter method;
- RPC operation;
- pipeline run and stage;
- MCP session and tool call;
- artifact and validation finding.

The canonical join chain is:

```text
sourceRef -> capability.id -> selection -> tool.name -> rpc operation
```

UI-only metadata must not be written into source-derived analysis artifacts.

## 5. Import and Generation Flow

1. The user selects a source directory or ZIP and supplies a target MCP schema.
2. The service copies accepted files into an isolated workspace.
3. Import validation rejects traversal, links escaping the workspace, excessive counts or sizes, unsupported files, and invalid schemas.
4. Analysis produces `analysis.json` from live source only.
5. The intermediate result is validated against `schema/analysis.schema.json` and reconciled with the user's target MCP schema.
6. Capability Discovery shows findings and provenance.
7. Curate Studio writes the explicit capability selection.
8. The deterministic CLI scaffolds and generates the MCP Server.
9. `validate-config` and `wire-check` must pass before build or real execution.
10. Tests and build run with streamed logs.
11. The MCP Playground launches the generated server and verifies real protocol behavior.
12. Registration and device deployment are unlocked only after required gates pass.

## 6. Command and Confirmation Policy

The browser sends structured operation requests, never command strings.

- Read-only operations run without confirmation.
- Analyze, Curate persistence, Scaffold, Generate, Test, Verify, and safe local server lifecycle require a normal confirmation when they write or execute.
- Build and Register require a single explicit confirmation.
- Deploy and real-device tool calls require the user to type the active project name.
- The service rejects unknown flags, paths outside the active workspace, and commands not present in the allowlist.
- Processes run without `shell: true`.
- Only one mutating pipeline operation may run for a project at a time.

## 7. Error Handling and Recovery

- Every failure is associated with a stage, artifact, file, field, and process exit status where available.
- Logs are streamed and retained with a bounded size.
- Failed runs keep their isolated workspace for inspection.
- Retrying a stage uses explicit saved inputs and never silently changes selection.
- A failed gate blocks downstream build, MCP execution, registration, and deployment according to policy.
- MCP process crashes, malformed protocol output, and timeouts terminate the session and produce a visible diagnostic.
- UI disconnection does not orphan a process; the service tracks and terminates or reattaches according to operation policy.

## 8. Visual System

Use the supplied Aether Dynamics tokens as the source visual direction:

- background `#09090B`;
- primary purple `#4B4BA0`;
- supporting purple `#8F47AE`;
- zinc glass surfaces and borders;
- system display typography with monospaced technical copy;
- 4px spacing rhythm;
- thin gradient border shells;
- glass blur around 12px;
- minimal 150ms/300ms motion;
- linear Solar-style iconography.

Status colors outside the supplied palette are limited to semantic success, warning, and error indicators. They must remain subordinate to the purple brand system.

## 9. Testing Strategy

### Frontend

- component tests for every primary view;
- provenance selection synchronization tests;
- Curate filtering and persistence tests;
- pipeline state rendering tests;
- MCP schema-form and response rendering tests;
- reduced-motion and renderer fallback tests;
- responsive layout and accessibility checks.

### Control service

- traversal, archive bomb, symlink, file-count, and size-limit import tests;
- target schema and intermediate schema validation tests;
- command allowlist and confirmation-policy tests;
- no-shell process execution tests;
- concurrency and cancellation tests;
- state normalization and SSE replay tests;
- real stdio MCP initialize/list/call integration tests;
- deployment lock and typed-confirmation tests.

### End to end

An end-to-end fixture imports a sample project and target schema, discovers capabilities, curates a subset, generates and builds the MCP Server, verifies its tools, executes a tool in the Playground, and confirms that deployment remains blocked until all gates and confirmations pass.

## 10. Scope Boundaries

Included:

- local single-user workbench;
- directory and ZIP source import;
- target MCP schema upload;
- BRIDGE pipeline visualization and full local control;
- real MCP stdio client for the active generated project;
- optional real-device deployment with strong confirmation.

Excluded from the first release:

- LAN or internet exposure;
- multi-user accounts;
- arbitrary shell terminal;
- arbitrary external MCP server registration;
- cloud storage or hosted execution;
- automatic browser launch;
- unconstrained high-DPR or always-on WebGL rendering.

## 11. Acceptance Criteria

- A user can import source and a target MCP schema through the UI.
- The UI visualizes source structure and discovered upper-level interfaces.
- Every generated MCP tool is traceable to its source capability and RPC mapping.
- Curate selection is interactive, persisted, and reflected in generation coverage.
- The complete BRIDGE pipeline state and artifacts are visible.
- The Playground performs real MCP initialize/list/call operations.
- Full control is limited to allowed operations with tiered confirmation.
- Deployment cannot run when required gates fail.
- The service listens only on `127.0.0.1`.
- The visual experience follows Aether Dynamics while respecting the resource limits.
- No repository command automatically opens a browser or starts the visualization.
