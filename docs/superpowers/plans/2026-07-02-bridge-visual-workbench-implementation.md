# BRIDGE Visual Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a localhost-only React workbench that imports project source and a target schema, visualizes the BRIDGE transformation, runs agent and deterministic pipeline stages, and provides a real MCP playground.

**Architecture:** A React/Vite frontend under `ui/` consumes a typed localhost HTTP/SSE API. A Node/TypeScript service under `control-server/` owns isolated workspaces, invokes only allowlisted BRIDGE or Codex operations without a shell, normalizes artifacts into a provenance graph, and manages stdio MCP sessions. Agent-judgment phases use the installed Codex executable and existing plugin skills; deterministic phases call the existing CLI.

**Tech Stack:** React 19, Vite 7, TypeScript 5.7, Vitest 3, Node HTTP, Zod, `@modelcontextprotocol/sdk`, `fflate`, CSS, Canvas 2D with optional WebGL capability detection.

---

## File Structure

### Shared contracts

- Create `workbench-contracts/package.json`
- Create `workbench-contracts/tsconfig.json`
- Create `workbench-contracts/src/index.ts` — API entities, commands, events, provenance graph, MCP payloads.
- Create `workbench-contracts/tests/contracts.test.ts`

### Control service

- Create `control-server/package.json`
- Create `control-server/tsconfig.json`
- Create `control-server/vitest.config.ts`
- Create `control-server/src/config.ts` — localhost, limits, repository paths.
- Create `control-server/src/security/paths.ts` — path containment and import-name validation.
- Create `control-server/src/import/workspace-manager.ts` — isolated workspace creation and file import.
- Create `control-server/src/scanner/project-scanner.ts` — source tree and interface discovery projection.
- Create `control-server/src/artifacts/artifact-reader.ts` — analysis, selection, schema, config, and state normalization.
- Create `control-server/src/pipeline/command-policy.ts` — allowlist and confirmation tiers.
- Create `control-server/src/pipeline/process-runner.ts` — no-shell process execution and bounded logs.
- Create `control-server/src/pipeline/pipeline-runner.ts` — deterministic CLI and Codex skill stage orchestration.
- Create `control-server/src/events/event-bus.ts` — SSE replay and subscriptions.
- Create `control-server/src/mcp/session-manager.ts` — real stdio MCP client lifecycle.
- Create `control-server/src/http/router.ts` — JSON API and SSE routing.
- Create `control-server/src/server.ts` — server entry point.
- Create focused tests mirroring each module under `control-server/tests/`.

### Frontend

- Create `ui/package.json`, `ui/tsconfig*.json`, `ui/vite.config.ts`, `ui/index.html`.
- Create `ui/src/main.tsx`, `ui/src/App.tsx`, `ui/src/styles.css`.
- Create `ui/src/api/client.ts`, `ui/src/api/events.ts`.
- Create `ui/src/state/workbench.tsx`.
- Create `ui/src/visuals/AetherField.tsx`.
- Create `ui/src/components/ProjectImport.tsx`.
- Create `ui/src/components/HeroOverview.tsx`.
- Create `ui/src/components/SourceExplorer.tsx`.
- Create `ui/src/components/CapabilityDiscovery.tsx`.
- Create `ui/src/components/CurateStudio.tsx`.
- Create `ui/src/components/TransformationMap.tsx`.
- Create `ui/src/components/PipelineCanvas.tsx`.
- Create `ui/src/components/CommandCenter.tsx`.
- Create `ui/src/components/McpPlayground.tsx`.
- Create `ui/src/components/ArtifactInspector.tsx`.
- Create `ui/src/components/CoverageDashboard.tsx`.
- Create `ui/src/components/LogTerminal.tsx`.
- Create component tests under `ui/src/components/*.test.tsx` and an integration test under `ui/src/App.test.tsx`.

### Repository integration

- Create root `package.json` with npm workspaces and unified scripts.
- Modify `.gitignore` for workbench build output and isolated runtime workspaces.
- Modify `README.md` and `README.zh-CN.md` with workbench setup and resource guarantees.
- Create `docs/WORKBENCH.md` with security, operation policy, and troubleshooting.

---

### Task 1: Add shared workbench contracts

**Files:**
- Create: `workbench-contracts/package.json`
- Create: `workbench-contracts/tsconfig.json`
- Create: `workbench-contracts/src/index.ts`
- Test: `workbench-contracts/tests/contracts.test.ts`

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import { confirmationFor, pipelineStages } from "../src/index.js";

describe("workbench contracts", () => {
  it("keeps the BRIDGE stage order stable", () => {
    expect(pipelineStages.map((stage) => stage.id)).toEqual([
      "import", "analyze", "curate", "scaffold", "generate",
      "validate_config", "wire_check", "test", "build",
      "register", "verify", "schema_preview", "deploy",
    ]);
  });

  it("assigns typed confirmation to deploy and real MCP calls", () => {
    expect(confirmationFor("deploy")).toBe("typed-project-name");
    expect(confirmationFor("mcp_call_real")).toBe("typed-project-name");
    expect(confirmationFor("scan")).toBe("none");
  });
});
```

- [ ] **Step 2: Run the test and verify module-not-found failure**

Run: `npm test --workspace workbench-contracts`

Expected: FAIL because the workspace and exported contracts do not exist.

- [ ] **Step 3: Implement contracts**

Define literal types for `PipelineStageId`, `StageStatus`, `ConfirmationLevel`, `OperationId`, `ProjectSummary`, `SourceNode`, `Capability`, `ToolProjection`, `RpcProjection`, `ProvenanceEdge`, `PipelineRun`, `WorkbenchEvent`, `McpTool`, and `McpCallRecord`. Export `pipelineStages` and a total `confirmationFor(operation)` switch. Keep every entity JSON-serializable.

```ts
export type ConfirmationLevel = "none" | "confirm" | "typed-project-name";
export type OperationId =
  | "scan" | "analyze" | "curate" | "scaffold" | "generate"
  | "validate_config" | "wire_check" | "test" | "build"
  | "register" | "verify" | "schema_preview" | "deploy"
  | "mcp_start" | "mcp_stop" | "mcp_call_mock" | "mcp_call_real";

export function confirmationFor(operation: OperationId): ConfirmationLevel {
  if (operation === "deploy" || operation === "mcp_call_real") return "typed-project-name";
  if (["curate", "scaffold", "generate", "test", "build", "register", "verify", "schema_preview", "mcp_start", "mcp_stop", "mcp_call_mock"].includes(operation)) return "confirm";
  return "none";
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test --workspace workbench-contracts && npm run build --workspace workbench-contracts`

Expected: all contract tests pass and TypeScript exits zero.

- [ ] **Step 5: Commit**

```bash
git add package.json workbench-contracts
git commit -m "feat(workbench): add shared contracts"
```

### Task 2: Implement safe project import and isolated workspaces

**Files:**
- Create: `control-server/src/config.ts`
- Create: `control-server/src/security/paths.ts`
- Create: `control-server/src/import/workspace-manager.ts`
- Test: `control-server/tests/workspace-manager.test.ts`

- [ ] **Step 1: Write traversal and limit tests**

Test imports containing `../escape.ts`, absolute paths, drive-prefixed paths, symlinks, more than 5,000 files, an individual file over 5 MiB, and a total payload over 100 MiB. Assert rejection. Test a normal source tree and target schema, then assert all files reside below the returned workspace root.

```ts
await expect(manager.importProject({
  projectName: "demo",
  files: [{ path: "../escape.ts", contentBase64: "eA==" }],
  targetSchema: { type: "object" },
})).rejects.toThrow(/unsafe import path/i);
```

- [ ] **Step 2: Verify the tests fail**

Run: `npm test --workspace control-server -- workspace-manager.test.ts`

Expected: FAIL because the manager is missing.

- [ ] **Step 3: Implement containment and atomic import**

Use `path.resolve(root, relativePath)` followed by `path.relative(root, candidate)` containment checks. Reject absolute, empty, dot-segment, NUL, and platform-drive paths. Write into a random staging directory, validate the target schema as JSON, then rename the staging directory to its final project ID. Never follow imported symlinks.

```ts
export function assertContained(root: string, relativePath: string): string {
  if (!relativePath || relativePath.includes("\0") || path.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new Error(`Unsafe import path: ${relativePath}`);
  }
  const candidate = path.resolve(root, relativePath);
  const rel = path.relative(root, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`Unsafe import path: ${relativePath}`);
  return candidate;
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test --workspace control-server -- workspace-manager.test.ts`

Expected: all import-security tests pass.

- [ ] **Step 5: Commit**

```bash
git add control-server/src/config.ts control-server/src/security control-server/src/import control-server/tests/workspace-manager.test.ts
git commit -m "feat(workbench): isolate imported projects"
```

### Task 3: Build project scanning and artifact provenance

**Files:**
- Create: `control-server/src/scanner/project-scanner.ts`
- Create: `control-server/src/artifacts/artifact-reader.ts`
- Test: `control-server/tests/project-scanner.test.ts`
- Test: `control-server/tests/artifact-reader.test.ts`

- [ ] **Step 1: Write scanner and provenance tests**

Use a fixture with a manifest, service file, SDK import, `analysis.json`, `selection.json`, `tools-schema.json`, and `rpc/config.json`. Assert the scanner returns a bounded source tree and the artifact reader joins:

```text
src/service.ts:readStatus -> read_status -> selected -> read_status tool -> read_status RPC op
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace control-server -- project-scanner.test.ts artifact-reader.test.ts`

Expected: FAIL because scanner modules are missing.

- [ ] **Step 3: Implement deterministic scanning**

Walk accepted files without following symlinks. Parse TypeScript with lightweight regular-expression evidence only for display: imports, exported functions, classes, and method names. Do not claim this scan is the authoritative Analyze result. Read JSON artifacts defensively with size limits and produce normalized entities plus provenance edges using `sourceRef`, capability ID, tool name, and RPC key.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace control-server -- project-scanner.test.ts artifact-reader.test.ts`

Expected: tests pass and malformed artifacts become findings rather than server crashes.

- [ ] **Step 5: Commit**

```bash
git add control-server/src/scanner control-server/src/artifacts control-server/tests/project-scanner.test.ts control-server/tests/artifact-reader.test.ts
git commit -m "feat(workbench): map source to MCP provenance"
```

### Task 4: Add command policy and no-shell process execution

**Files:**
- Create: `control-server/src/pipeline/command-policy.ts`
- Create: `control-server/src/pipeline/process-runner.ts`
- Test: `control-server/tests/command-policy.test.ts`
- Test: `control-server/tests/process-runner.test.ts`

- [ ] **Step 1: Write policy and injection tests**

Assert unknown operations, unknown flags, paths outside the workspace, mismatched typed confirmation, and concurrent mutations are rejected. Use a harmless argument containing `& echo injected` and assert it arrives as one literal argument rather than executing a second command.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace control-server -- command-policy.test.ts process-runner.test.ts`

Expected: FAIL because policy and runner are missing.

- [ ] **Step 3: Implement structured operations**

Represent every command as `{ executable, args, cwd, operation, projectId }`. Spawn with `shell: false`, `windowsHide: true`, bounded stdout/stderr, AbortSignal cancellation, and a process timeout. Resolve Node and Codex executables from explicit configuration; never accept an executable from the request body.

```ts
const child = spawn(spec.executable, spec.args, {
  cwd: spec.cwd,
  shell: false,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
  signal,
});
```

- [ ] **Step 4: Run tests**

Run: `npm test --workspace control-server -- command-policy.test.ts process-runner.test.ts`

Expected: all policy and literal-argument tests pass.

- [ ] **Step 5: Commit**

```bash
git add control-server/src/pipeline/command-policy.ts control-server/src/pipeline/process-runner.ts control-server/tests
git commit -m "feat(workbench): enforce command policy"
```

### Task 5: Orchestrate agent and deterministic BRIDGE stages

**Files:**
- Create: `control-server/src/pipeline/pipeline-runner.ts`
- Create: `control-server/src/events/event-bus.ts`
- Test: `control-server/tests/pipeline-runner.test.ts`
- Test: `control-server/tests/event-bus.test.ts`

- [ ] **Step 1: Write orchestration tests**

Stub `ProcessRunner` and assert:

- Analyze invokes configured Codex with a prompt requiring `$mcp-analyze`, the imported source path, target schema path, and output path.
- Generate invokes `$mcp-generate` only after scaffold.
- Deterministic stages invoke `cli/bin/mcp-pipeline.js` with structured arguments.
- Failed gates block build, register, verify, MCP real mode, and deploy.
- Events retain the latest 500 records and replay after a provided sequence number.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace control-server -- pipeline-runner.test.ts event-bus.test.ts`

Expected: FAIL because orchestration is missing.

- [ ] **Step 3: Implement the runner**

Build exact stage specifications. Agent prompts must name the existing skill, forbid unrelated edits, and require machine-readable artifacts in the active isolated workspace. Do not enable network or full access automatically. Deterministic stages call the repository CLI through `process.execPath`.

```ts
const deterministic = (subcommand: string, args: string[]) => ({
  executable: process.execPath,
  args: [config.pipelineCliPath, subcommand, ...args],
  cwd: workspace.root,
});
```

- [ ] **Step 4: Run orchestration tests**

Run: `npm test --workspace control-server -- pipeline-runner.test.ts event-bus.test.ts`

Expected: all stage ordering, gate, and replay tests pass.

- [ ] **Step 5: Commit**

```bash
git add control-server/src/pipeline/pipeline-runner.ts control-server/src/events control-server/tests
git commit -m "feat(workbench): orchestrate BRIDGE stages"
```

### Task 6: Add real MCP session management

**Files:**
- Create: `control-server/src/mcp/session-manager.ts`
- Test: `control-server/tests/session-manager.test.ts`

- [ ] **Step 1: Write stdio MCP tests**

Create a fixture MCP server using the SDK. Assert start, initialize, list tools, call a mock tool, timeout handling, process crash handling, stop, and refusal of real calls without typed project confirmation.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace control-server -- session-manager.test.ts`

Expected: FAIL because the manager is missing.

- [ ] **Step 3: Implement one session per project**

Use `Client` and `StdioClientTransport`. Track mode (`mock` or `real`), server path, lifecycle, tools, calls, and timestamps. Validate arguments against the tool schema before calling. Enforce command policy again at the service boundary.

- [ ] **Step 4: Run MCP tests**

Run: `npm test --workspace control-server -- session-manager.test.ts`

Expected: all MCP lifecycle and policy tests pass.

- [ ] **Step 5: Commit**

```bash
git add control-server/src/mcp control-server/tests/session-manager.test.ts
git commit -m "feat(workbench): add real MCP playground backend"
```

### Task 7: Expose localhost JSON and SSE APIs

**Files:**
- Create: `control-server/src/http/router.ts`
- Create: `control-server/src/server.ts`
- Test: `control-server/tests/http-api.test.ts`

- [ ] **Step 1: Write API tests**

Test health, import, project summary, source tree, capabilities, selection persistence, stage execution, artifacts, coverage, events, MCP lifecycle, and MCP calls. Assert the server rejects non-loopback host configuration and request bodies over the configured limit.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace control-server -- http-api.test.ts`

Expected: FAIL because routes are missing.

- [ ] **Step 3: Implement built-in Node HTTP routing**

Use explicit method/path matching and Zod parsing. Return a consistent `{ ok, data, error }` envelope. SSE uses `id`, `event`, and JSON `data`, sends heartbeat comments every 15 seconds, and closes subscriptions on disconnect.

- [ ] **Step 4: Run API tests**

Run: `npm test --workspace control-server -- http-api.test.ts`

Expected: all API and loopback tests pass.

- [ ] **Step 5: Commit**

```bash
git add control-server/src/http control-server/src/server.ts control-server/tests/http-api.test.ts
git commit -m "feat(workbench): expose localhost control API"
```

### Task 8: Build the Aether UI foundation

**Files:**
- Create: `ui/src/styles.css`
- Create: `ui/src/visuals/AetherField.tsx`
- Create: `ui/src/components/HeroOverview.tsx`
- Create: `ui/src/state/workbench.tsx`
- Create: `ui/src/api/client.ts`
- Create: `ui/src/api/events.ts`
- Create: `ui/src/App.tsx`
- Test: `ui/src/App.test.tsx`
- Test: `ui/src/visuals/AetherField.test.tsx`

- [ ] **Step 1: Write foundation tests**

Assert the shell renders navigation, hero summary, connection state, and main workspace. Mock `matchMedia('(prefers-reduced-motion: reduce)')` and `document.hidden`; assert the renderer stops animation and falls back to a CSS poster.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace ui -- App.test.tsx AetherField.test.tsx`

Expected: FAIL because the UI is missing.

- [ ] **Step 3: Implement the visual shell**

Use CSS variables from Aether Dynamics, bounded glass panels, 4px rhythm, system display type, monospaced technical copy, thin gradient shells, and semantic status colors. Implement Canvas 2D particles with 45 FPS throttling, DPR 1.5 cap, pointer drift, visibility pause, reduced-motion poster, and explicit cleanup.

- [ ] **Step 4: Run tests and production build**

Run: `npm test --workspace ui -- App.test.tsx AetherField.test.tsx && npm run build --workspace ui`

Expected: tests pass and Vite builds without warnings treated as errors.

- [ ] **Step 5: Commit**

```bash
git add ui
git commit -m "feat(workbench): add Aether visual shell"
```

### Task 9: Implement source, discovery, Curate, and transformation views

**Files:**
- Create: `ui/src/components/ProjectImport.tsx`
- Create: `ui/src/components/SourceExplorer.tsx`
- Create: `ui/src/components/CapabilityDiscovery.tsx`
- Create: `ui/src/components/CurateStudio.tsx`
- Create: `ui/src/components/TransformationMap.tsx`
- Test: corresponding `*.test.tsx` files.

- [ ] **Step 1: Write interaction tests**

Test directory and target-schema selection, import progress, source-to-capability linked selection, filters, bulk Curate changes, persisted selection, selected count, and source-to-tool-to-RPC provenance gaps.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace ui -- ProjectImport SourceExplorer CapabilityDiscovery CurateStudio TransformationMap`

Expected: FAIL because components are missing.

- [ ] **Step 3: Implement focused components**

Use semantic HTML and SVG for graphs. Keep graph layout deterministic by sorting domains and IDs. Curate writes only selected IDs. Source previews use text content, never injected HTML. Every transformation node has accessible labels and keyboard selection.

- [ ] **Step 4: Run component tests**

Run: `npm test --workspace ui -- ProjectImport SourceExplorer CapabilityDiscovery CurateStudio TransformationMap`

Expected: all import, linked-selection, and Curate tests pass.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components ui/src/state
git commit -m "feat(workbench): visualize source and curation"
```

### Task 10: Implement pipeline control, artifacts, coverage, and logs

**Files:**
- Create: `ui/src/components/PipelineCanvas.tsx`
- Create: `ui/src/components/CommandCenter.tsx`
- Create: `ui/src/components/ArtifactInspector.tsx`
- Create: `ui/src/components/CoverageDashboard.tsx`
- Create: `ui/src/components/LogTerminal.tsx`
- Test: corresponding `*.test.tsx` files.

- [ ] **Step 1: Write pipeline UI tests**

Test stage status, animated-running class only while active, downstream blocking, single and typed confirmations, cancellation, artifact tabs, coverage calculations, bounded log output, and SSE reconnection with last event ID.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace ui -- PipelineCanvas CommandCenter ArtifactInspector CoverageDashboard LogTerminal`

Expected: FAIL because components are missing.

- [ ] **Step 3: Implement the views**

Derive all stage state from server entities. Never infer gate success from log text. Typed confirmation must equal the active project name. Render artifacts as escaped text/JSON. Limit the in-memory terminal to 5,000 lines.

- [ ] **Step 4: Run component tests**

Run: `npm test --workspace ui -- PipelineCanvas CommandCenter ArtifactInspector CoverageDashboard LogTerminal`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components ui/src/api
git commit -m "feat(workbench): add pipeline command center"
```

### Task 11: Implement the real MCP Playground UI

**Files:**
- Create: `ui/src/components/McpPlayground.tsx`
- Test: `ui/src/components/McpPlayground.test.tsx`

- [ ] **Step 1: Write playground tests**

Test server start/stop, tool listing, schema-derived string/number/boolean/enum fields, mock call, typed real call confirmation, raw JSON-RPC display, latency, errors, and mode labeling.

- [ ] **Step 2: Verify tests fail**

Run: `npm test --workspace ui -- McpPlayground.test.tsx`

Expected: FAIL because the component is missing.

- [ ] **Step 3: Implement schema-driven forms and call history**

Render supported JSON Schema primitives and enums. For unsupported constructs, expose a validated JSON editor. Keep mock and real modes visually distinct and require a new typed confirmation for each real-device call.

- [ ] **Step 4: Run tests**

Run: `npm test --workspace ui -- McpPlayground.test.tsx`

Expected: all playground tests pass.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/McpPlayground.tsx ui/src/components/McpPlayground.test.tsx
git commit -m "feat(workbench): add MCP playground UI"
```

### Task 12: Complete integration, performance guards, and documentation

**Files:**
- Create: `control-server/tests/e2e-workbench.test.ts`
- Create: `docs/WORKBENCH.md`
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `.gitignore`
- Modify: root `package.json`

- [ ] **Step 1: Write the vertical end-to-end test**

Import a fixture source and target schema; stub only the Codex agent result with deterministic `analysis.json` and `rpc/config.json`; run real CLI scaffold/gates/test/build/schema preview; read provenance and coverage; start the generated MCP Server; list and call a mock tool; assert deploy is blocked without typed confirmation.

- [ ] **Step 2: Verify the test fails before final wiring**

Run: `npm test --workspace control-server -- e2e-workbench.test.ts`

Expected: FAIL at the first missing integration route or state transition.

- [ ] **Step 3: Wire root scripts and documentation**

Add scripts:

```json
{
  "scripts": {
    "workbench:dev": "concurrently -k -n api,ui npm:workbench:api npm:workbench:ui",
    "workbench:api": "npm run dev --workspace control-server",
    "workbench:ui": "npm run dev --workspace ui",
    "workbench:build": "npm run build --workspaces --if-present",
    "workbench:test": "npm test --workspaces --if-present"
  }
}
```

Document localhost-only operation, Codex executable configuration, import limits, confirmation levels, mock versus real calls, resource controls, and the fact that scripts never auto-open a browser.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm run workbench:test
npm run workbench:build
npm test --prefix framework
npm test --prefix cli
node scripts/check-manifests.js
```

Expected: every suite passes, all packages typecheck/build, and manifest checks exit zero.

- [ ] **Step 5: Run a bounded manual smoke test**

Start the API on `127.0.0.1` and query `/api/health` with an HTTP client. Build the UI and inspect generated assets. Do not launch a browser automatically. If a browser inspection is later approved, use reduced motion and verify no renderer exceeds its resource budget.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore README.md README.zh-CN.md docs/WORKBENCH.md control-server ui workbench-contracts
git commit -m "feat: deliver BRIDGE visual workbench"
```

## Self-Review

- Spec coverage: import, source graph, capability discovery, Curate, provenance, pipeline control, artifact/coverage views, MCP playground, real deployment confirmation, Aether visuals, localhost binding, and resource limits are each assigned to tasks.
- Scope: the three packages remain independently testable; agent analysis is delegated to existing skills through Codex instead of duplicated.
- Security: path containment, no-shell execution, operation allowlist, typed confirmation, bounded logs, loopback binding, and gate blocking are explicit test requirements.
- Type consistency: shared operation, stage, event, provenance, and MCP entities originate in `workbench-contracts` and are consumed by both service and UI.
- Placeholder scan: no TBD/TODO implementation placeholders remain.
