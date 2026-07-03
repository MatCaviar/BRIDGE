# BRIDGE Executable Framework Repair Design

## 1. Objective

Repair the BRIDGE Visual Workbench so a real YunOS TypeScript project can move through import, source discovery, Analyze, Curate, Scaffold, Generate, validation gates, test, build, MCP startup, and a mock `tools/call` without hidden manual state. The reference acceptance project is `source_code/imaudio_app_code`.

Real-device execution is not simulated. It is enabled only when generated wire mappings pass the deterministic gates and the required device transport is available.

## 2. Chosen approach

Use a language-aware deterministic source index, persisted pipeline state, artifact contracts, and an end-to-end fixture. This replaces the current loose coupling between a shallow regex file graph, in-memory stage status, and LLM-produced artifacts.

Incrementally adding more unrelated regular expressions is rejected because it cannot reliably distinguish imports, declarations, callable methods, and RPC evidence. A full Tree-sitter integration is deferred because the supported TypeScript and Android patterns can be covered with focused extractors without adding a large runtime dependency.

## 3. Source index

The scanner produces normalized entities rather than a flat list of loosely typed symbols:

- directories and files;
- classes, interfaces, objects, and functions;
- callable methods with visibility, owner, source line, and stable ID;
- imports as dependency edges, not upper-level interface candidates;
- RPC evidence such as `createMethodCallMessage`, `funcName`, AIDL methods, and SDK calls;
- extraction findings for unreadable, oversized, truncated, or unsupported files.

Language extractors are isolated by language family. The first repair covers TypeScript/JavaScript plus the existing Kotlin/Java/AIDL behavior. Stable IDs use normalized relative paths, declaration kind, owner, name, and line so duplicate method names do not collapse.

The index is written to `source-index.json` in the imported workspace and is exposed by the source API. The UI can therefore render the same facts used by Analyze.

## 4. Pipeline data flow

1. Import filters files, validates limits, writes the target schema, and builds `source-index.json`.
2. Analyze receives the source root, source index, and target schema. It emits only source-backed capabilities and reports target-only gaps.
3. Curate accepts only capability IDs present in `analysis.json` and persists a stable selection.
4. Scaffold consumes validated analysis and selection.
5. Generate maps every selected capability to a verified RPC entry or an explicit `_deferred` entry with a reason.
6. `validate_config` and `wire_check` verify schema, coverage, dispatch construction, and source wire evidence.
7. Test and build run only after both gates pass.
8. MCP mock startup performs real stdio `initialize`, `tools/list`, and `tools/call` against the built generated server.
9. Real MCP startup remains blocked until all real-execution gates pass.

Target matching and source discovery remain separate. A semantically unrelated schema may produce zero target matches without deleting valid source capabilities or fabricating executable tools.

## 5. Persistent execution state

The control service reconstructs project and stage state from workspace metadata and artifacts when it starts. Stage readiness is derived from validated inputs and outputs rather than an in-memory map alone.

Each stage records:

- status and timestamps;
- normalized input and output paths;
- process exit, timeout, and cancellation state;
- bounded diagnostic output;
- artifact validation findings.

A zero exit code is insufficient when the required output is missing or invalid. Such a stage is recorded as failed and downstream stages remain blocked.

## 6. UI truth model

The UI distinguishes these states:

- discovered in source;
- promoted to capability;
- matched to a target schema entry;
- selected in Curate;
- generated as an MCP tool;
- mock executable;
- real executable;
- deferred or blocked, with a reason.

Imports are displayed as dependency edges and do not inflate interface counts. Source declarations and RPC evidence link to capabilities and generated operations through stable IDs. Empty and error states explain which artifact or gate is missing.

## 7. Failure handling

- Import rejects traversal, links, excessive sizes, and malformed schema before writing a project record.
- Scanner findings are visible and never silently converted into capabilities.
- Analyze and Generate failures expose the useful tail of process output.
- Curate rejects unknown or stale capability IDs.
- Every stage validates its required artifact after execution.
- Service restart preserves imported projects and recoverable stage progress.
- Mock execution cannot be labeled real execution.
- Real execution fails closed when wire evidence, build output, transport, or typed confirmation is missing.

## 8. Verification strategy

Unit tests cover TypeScript declarations, default and non-exported manager classes, class methods, duplicate method names, comments and string false positives, RPC call evidence, imports as edges, source locations, and node limits.

Control-service tests cover source-index persistence, project recovery, artifact-based stage hydration, stale Curate rejection, post-stage artifact validation, and truthful execution states.

UI tests cover source/interface counts, provenance state labels, target mismatch, deferred tools, stage failures, and mock-versus-real status.

The end-to-end test imports a bounded fixture based on the structural patterns in `imaudio_app_code`, runs the deterministic pipeline through build, starts the generated MCP server, executes `initialize`, `tools/list`, and one mock `tools/call`, and verifies that real mode remains blocked.

A separate real-project smoke test imports `source_code/imaudio_app_code` and asserts that representative manager methods and proxy wire calls appear in the source index. Large binary resources remain excluded.

## 9. Acceptance criteria

- `imaudio_app_code` imports without loading its binary resource set.
- Source visualization identifies representative interfaces, manager classes, public methods, proxies, and RPC evidence without presenting imports as interfaces.
- Analyze consumes the deterministic source index and emits source-backed capabilities.
- Curate, Scaffold, Generate, both gates, Test, and Build have reproducible pass/fail states and survive a service restart.
- A built generated server completes real MCP stdio initialization, tool discovery, and a mock tool call.
- Target-only gaps and deferred transports remain visible and non-executable.
- Real mode cannot start unless all required gates and confirmations pass.
- Full workspace tests, production build, plugin validation, and the real-project smoke test pass.
