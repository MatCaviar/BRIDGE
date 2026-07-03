# Source-First MCP Auto Pipeline Design

**Date:** 2026-07-03

## Goal

Make BRIDGE Workbench source-first: imported application code is the sole source of MCP capability candidates. The user-provided MCP schema defines the generated tool format and may contain reference examples, but it does not prescribe tool names and must not create synthetic candidates or target-gap findings.

The only normal pause in the generation workflow is Curate. After the user selects analyzed capabilities, Workbench automatically runs the remaining local generation stages until it produces a built, mock-verified MCP suite or encounters a failure.

## Workflow

1. The user selects a source directory and an MCP output-format schema.
2. Workbench imports both inputs and starts Analyze.
3. Analyze discovers callable capabilities only from live source evidence and records source paths, symbols, parameters, returns, safety, confidence, and RPC evidence.
4. Workbench enters `awaiting_curate` and displays the discovered capabilities.
5. The user selects capabilities and confirms Curate.
6. Workbench automatically executes `scaffold`, `generate`, validation gates, generated tests, build, and mock verification in dependency order.
7. The first failed stage stops the run. The UI preserves its error and offers retry from that stage.
8. Real deployment and side-effecting MCP calls remain explicit confirmation boundaries.

## Schema Semantics

The imported schema is a formatting contract and reference document. It may be a JSON Schema, a normalized MCP tool-list envelope, or adjacent reference tool objects supported by the existing parser.

Analyze may use it to learn:

- tool descriptor shape;
- parameter and return encoding conventions;
- naming and description style;
- validation constraints that apply to generated schemas.

Analyze must not:

- promote a schema example into a capability without source evidence;
- treat a referenced tool name as a required target;
- report a missing source implementation merely because a reference example is absent;
- rewrite source evidence to resemble a schema example.

Artifact coverage therefore measures selected and generated source capabilities, not name overlap with reference examples.

## Orchestration

The Electron main-process `WorkbenchService` owns a persistent pipeline run. The renderer requests import, Curate confirmation, cancellation, and retry; it does not chain stages itself.

The run state records:

- project and run identifiers;
- current state and active stage;
- ordered stage results;
- selected capability identifiers;
- failure details and retry stage;
- timestamps and final readiness.

States are `analyzing`, `awaiting_curate`, `running`, `failed`, `mock_ready`, and `cancelled`. At most one run may execute for a project. Restart recovery reconstructs state from persisted stage artifacts; completed postconditions are not rerun unnecessarily.

After Curate, the service advances stages sequentially. A failed command or failed postcondition transitions to `failed` immediately. Retry starts at the failed stage after rechecking prerequisites. The existing allowlisted commands, timeouts, bounded logs, and confirmation rules remain in force.

## UI Behavior

Import shows progress and moves directly into Analyze. The Curate view is the only normal human decision point. After confirmation, the pipeline visualization advances automatically and streams stage logs and artifacts.

On failure the UI shows the failed stage, concise cause, retained logs, and a `Retry from <stage>` action. It does not silently skip stages. Mock readiness opens the existing MCP Playground; real calls retain typed confirmation.

## Dedicated Test Fixture

Add `source_code/mock-audio-android`, a deliberately small Android/Kotlin project containing:

- minimal Gradle and Android manifest descriptors;
- an AIDL contract;
- an audio manager and RPC proxy;
- three source-backed operations: get volume, set volume, and set mute;
- explicit wire operation names, parameters, return/error behavior, and lightweight documentation.

Add `schema/mock-mcp-output.schema.json`, which defines the accepted MCP tool descriptor structure and includes an unrelated reference example. That example is intentionally absent from the source and must never appear as an analyzed capability or gap.

The fixture is source input, not precomputed analysis. Curate selections and generated artifacts are created during the run.

## Error Handling and Safety

- Invalid source or schema input fails before Analyze with an actionable message.
- Empty analysis enters Curate with no selectable capabilities and blocks continuation.
- Empty Curate selection is rejected.
- Failure stops automatic execution at the first failing stage.
- Cancellation terminates only the active allowlisted child process and records `cancelled`.
- Generated real deployment and side-effecting MCP calls never run automatically.

## Verification

Automated tests must prove:

1. The mock source and schema import through the same local path used by Electron.
2. Source indexing finds the Android/AIDL/manager/proxy evidence and all three operations.
3. The unrelated schema reference never becomes a candidate or a target gap.
4. Analyze completion pauses in `awaiting_curate`.
5. Curate confirmation executes all downstream stages in order without another pause.
6. A stage failure stops later stages and retry resumes at the failed stage.
7. Existing no-HTTP, persistence, security, CLI E2E, build, and Electron smoke tests remain green.

## Acceptance Criteria

- Candidate tools are traceable to source and independent of reference tool names.
- Curate is the sole normal pause between import and mock-ready output.
- Downstream stages execute automatically and stop on the first error.
- The dedicated fixture is small enough for quick visual testing and catches schema-to-candidate leakage.
- Workbench remains a local Electron/IPC application with no HTTP control plane.
