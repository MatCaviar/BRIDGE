# BRIDGE Executable Framework Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the BRIDGE Workbench truthfully discover real interfaces and execute the local pipeline through a built MCP mock call using `imaudio_app_code` as the real-project smoke input.

**Architecture:** Replace TypeScript regex discovery with a compiler-AST extractor and normalize its output into a persisted `SourceIndex`. Recover projects and stage readiness from workspace metadata and validated artifacts, enforce stage postconditions, and make the UI render those persisted execution facts.

**Tech Stack:** TypeScript, TypeScript Compiler API, Node.js, React, Vitest, MCP stdio SDK.

---

### Task 1: Language-aware source index

**Files:**
- Create: `control-server/src/scanner/typescript-extractor.ts`
- Modify: `workbench-contracts/src/index.ts`
- Modify: `control-server/src/scanner/project-scanner.ts`
- Test: `control-server/tests/project-scanner.test.ts`

- [ ] **Step 1: Write failing AST extraction tests**

Add a fixture containing a default class, non-exported manager class, interface, duplicate method names, imports, comments containing fake declarations, and `createMethodCallMessage`. Assert declarations have owner/line/visibility, imports are dependency edges, and RPC calls are evidence nodes.

```ts
expect(index.nodes).toEqual(expect.arrayContaining([
  expect.objectContaining({ label: "KaraokeManager", symbolKind: "class" }),
  expect.objectContaining({ label: "setMicVol", symbolKind: "method", owner: "KaraokeManager" }),
  expect.objectContaining({ label: "SoundMode", symbolKind: "interface" }),
]));
expect(index.nodes.some((node) => node.label === "FakeFromComment")).toBe(false);
expect(index.edges).toContainEqual(expect.objectContaining({ kind: "imports" }));
expect(index.evidence).toContainEqual(expect.objectContaining({ operation: "setMicVol" }));
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test --prefix control-server -- project-scanner.test.ts`

Expected: FAIL because `interface`, `owner`, `edges`, and `evidence` are not produced.

- [ ] **Step 3: Add normalized source-index contracts**

Extend `SourceNode` and add explicit edge/evidence containers.

```ts
export type SourceSymbolKind = "function" | "method" | "class" | "interface" | "object";
export interface SourceNode {
  readonly id: string;
  readonly path: string;
  readonly kind: "file" | "directory" | "symbol" | "evidence";
  readonly label: string;
  readonly parentId?: string;
  readonly symbolKind?: SourceSymbolKind;
  readonly owner?: string;
  readonly visibility?: "public" | "protected" | "private";
  readonly line?: number;
}
export interface SourceEdge { readonly from: string; readonly to: string; readonly kind: "contains" | "imports" | "calls"; }
export interface RpcEvidence { readonly id: string; readonly path: string; readonly line: number; readonly operation: string; readonly transport: "dbus" | "native" | "aidl"; }
export interface SourceIndex { readonly version: 1; readonly nodes: readonly SourceNode[]; readonly edges: readonly SourceEdge[]; readonly evidence: readonly RpcEvidence[]; readonly findings: readonly string[]; }
```

- [ ] **Step 4: Implement the TypeScript Compiler API extractor**

Use `typescript.createSourceFile`, walk class/interface/function declarations, collect method declarations with source lines and modifiers, read import module specifiers into edges, and inspect call expressions named `createMethodCallMessage` plus `funcName` properties into `RpcEvidence`. Do not collect identifiers from comments or string literals.

- [ ] **Step 5: Integrate extractors and verify GREEN**

Keep Kotlin/Java/AIDL extraction isolated in `project-scanner.ts`, merge results into `SourceIndex`, and run:

`npm test --prefix control-server -- project-scanner.test.ts`

Expected: all scanner tests pass.

- [ ] **Step 6: Commit**

```powershell
git add workbench-contracts/src/index.ts control-server/src/scanner control-server/tests/project-scanner.test.ts
git commit -m "fix(workbench): build language-aware source index"
```

### Task 2: Persist source index and recover imported projects

**Files:**
- Modify: `control-server/src/import/workspace-manager.ts`
- Modify: `control-server/src/http/router.ts`
- Test: `control-server/tests/workspace-manager.test.ts`
- Test: `control-server/tests/http-api.test.ts`

- [ ] **Step 1: Write failing persistence and restart tests**

Assert import writes `project.json` and `source-index.json`, `listProjects()` returns an imported project after constructing a new manager, and a new router can access that project.

```ts
const first = await workspaces.importProject(request);
const recovered = await new WorkspaceManager(root, limits).listProjects();
expect(recovered).toContainEqual(expect.objectContaining({ id: first.id }));
await expect(readFile(join(first.root, "source-index.json"), "utf8")).resolves.toContain("setMicVol");
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test --prefix control-server -- workspace-manager.test.ts http-api.test.ts`

Expected: FAIL because metadata/index persistence and recovery do not exist.

- [ ] **Step 3: Persist import metadata and index atomically**

After files and target schema are written in staging, call `scanProject(sourceRoot)`, write `source-index.json`, write a `ProjectSummary` to `project.json`, then rename staging to final root. Rewrite persisted paths to the final root before saving.

- [ ] **Step 4: Add workspace recovery**

Implement `listProjects()` by reading direct runtime-root children, validating `project.json`, rejecting paths outside the runtime root, and returning only records whose target schema and source directory exist.

- [ ] **Step 5: Hydrate the router and serve the persisted index**

Initialize the router project map from `listProjects()` through an async `ready` promise awaited by every request. `/source` reads `source-index.json` and only rescans if the artifact is missing or invalid.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test --prefix control-server -- workspace-manager.test.ts http-api.test.ts`

```powershell
git add control-server/src/import/workspace-manager.ts control-server/src/http/router.ts control-server/tests/workspace-manager.test.ts control-server/tests/http-api.test.ts
git commit -m "fix(workbench): persist imports and source indexes"
```

### Task 3: Persist and hydrate pipeline stage truth

**Files:**
- Create: `control-server/src/pipeline/stage-store.ts`
- Modify: `control-server/src/pipeline/pipeline-runner.ts`
- Modify: `control-server/src/http/router.ts`
- Test: `control-server/tests/pipeline-runner.test.ts`

- [ ] **Step 1: Write failing restart and postcondition tests**

Persist a passed Analyze result, construct a fresh runner, and assert Curate is runnable. Also return exit code zero without `analysis.json` and assert Analyze fails.

```ts
await runner.runStage(workspace, "analyze");
await expect(createRunnerWithSameStore().hydrate(workspace)).resolves.toBeUndefined();
expect(createRunnerWithSameStore().status("analyze")).toBe("passed");
```

- [ ] **Step 2: Verify RED**

Run: `npm test --prefix control-server -- pipeline-runner.test.ts`

Expected: FAIL because status exists only in memory and exit zero bypasses artifact validation.

- [ ] **Step 3: Implement `StageStore`**

Store `{ version: 1, stages: Record<PipelineStageId, PipelineStageState> }` at `.workbench/stages.json` using write-to-temporary-file plus rename. Invalid state files yield a finding and pending state rather than granting readiness.

- [ ] **Step 4: Add per-stage postconditions**

Validate required outputs: Analyze=`analysis.json`, Curate=`selection.json`, Scaffold=`package.json`, Generate=`rpc/config.json`, schema preview=`tools-schema.json`, Build=`dist/index.js`. Parse JSON outputs and run the existing analysis/config validators where applicable.

- [ ] **Step 5: Hydrate before authorization and persist transitions**

`runStage` loads persisted state once per workspace, records running/passed/failed transitions, validates the output before marking passed, and publishes the persisted error in its event.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test --prefix control-server -- pipeline-runner.test.ts`

```powershell
git add control-server/src/pipeline control-server/src/http/router.ts control-server/tests/pipeline-runner.test.ts
git commit -m "fix(workbench): persist validated pipeline stages"
```

### Task 4: Enforce Curate and execution contracts

**Files:**
- Modify: `control-server/src/http/router.ts`
- Modify: `control-server/src/artifacts/artifact-reader.ts`
- Modify: `workbench-contracts/src/index.ts`
- Test: `control-server/tests/http-api.test.ts`
- Test: `control-server/tests/artifact-reader.test.ts`

- [ ] **Step 1: Write failing contract tests**

Assert Curate rejects an unknown capability ID, artifact projections distinguish mock and real executability, and a deferred RPC entry is mock-executable but not real-executable only after build exists.

```ts
expect(response.status).toBe(400);
expect(body.error.message).toMatch(/unknown capability/i);
expect(tool).toMatchObject({ mockExecutable: true, realExecutable: false });
```

- [ ] **Step 2: Verify RED**

Run: `npm test --prefix control-server -- http-api.test.ts artifact-reader.test.ts`

- [ ] **Step 3: Validate Curate against analysis**

Load `analysis.json`, create the set of capability IDs, reject selected IDs outside it, deduplicate and sort accepted IDs, then persist the selection.

- [ ] **Step 4: Project truthful execution states**

Replace the single ambiguous `executable` projection with `mockExecutable`, `realExecutable`, and `blockedReason`. Derive mock readiness from generated tool plus built server; derive real readiness from a non-deferred valid RPC mapping and passed gates.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test --prefix control-server -- http-api.test.ts artifact-reader.test.ts`

```powershell
git add workbench-contracts/src/index.ts control-server/src/http/router.ts control-server/src/artifacts control-server/tests
git commit -m "fix(workbench): enforce curate and execution contracts"
```

### Task 5: Render source and execution truth in the UI

**Files:**
- Modify: `ui/src/state/workbench.tsx`
- Modify: `ui/src/components/SourceExplorer.tsx`
- Modify: `ui/src/components/CapabilityDiscovery.tsx`
- Modify: `ui/src/components/TransformationMap.tsx`
- Modify: `ui/src/components/PipelineCanvas.tsx`
- Modify: `ui/src/styles.css`
- Test: `ui/src/App.test.tsx`
- Create: `ui/src/components/SourceExplorer.test.tsx`

- [ ] **Step 1: Write failing component tests**

Render a source index containing imports, interfaces, methods, and RPC evidence. Assert the headline counts declarations rather than imports, filters expose RPC evidence, and tool states show `MOCK READY`, `REAL READY`, or a blocked reason.

```tsx
expect(screen.getByText("3 declarations")).toBeInTheDocument();
expect(screen.getByText(/setMicVol.*RPC/)).toBeInTheDocument();
expect(screen.getByText("MOCK READY")).toBeInTheDocument();
expect(screen.getByText("REAL BLOCKED")).toBeInTheDocument();
```

- [ ] **Step 2: Verify RED**

Run: `npm test --prefix ui -- SourceExplorer.test.tsx App.test.tsx`

- [ ] **Step 3: Consume `SourceIndex` and render semantic groups**

Store nodes, edges, evidence, and findings in state. Source Explorer groups declarations and RPC evidence, keeps files searchable, and displays imports only in a dependency subsection.

- [ ] **Step 4: Render persisted pipeline and execution state**

Pipeline Canvas uses the server stage snapshot before SSE deltas. Capability and transformation views display target match separately from mock/real readiness and always show blocked reasons.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test --prefix ui`

```powershell
git add ui/src
git commit -m "fix(workbench): visualize executable pipeline truth"
```

### Task 6: End-to-end executable pipeline and real-project smoke

**Files:**
- Create: `control-server/tests/fixtures/yunos-audio/`
- Create: `control-server/tests/executable-pipeline.test.ts`
- Create: `scripts/smoke-imaudio-workbench.mjs`
- Modify: `docs/WORKBENCH.md`

- [ ] **Step 1: Write the failing end-to-end test**

Import the bounded YunOS audio fixture, persist a validated analysis/selection and wire configuration, execute deterministic Scaffold, gates, Test, Build, start the generated stdio server, call one mock tool, and assert real startup is blocked.

```ts
expect((await session.listTools()).some((tool) => tool.name === "set_mic_volume")).toBe(true);
expect(await session.call("set_mic_volume", { volume: 5 })).toMatchObject({ isError: false });
expect(() => pipeline.assertRealMcpReady()).toThrow(/blocked/i);
```

- [ ] **Step 2: Verify RED**

Run: `npm test --prefix control-server -- executable-pipeline.test.ts`

Expected: FAIL at the first missing persisted-stage or executable-state contract.

- [ ] **Step 3: Complete only the glue exposed by the test**

Use the public router, CLI, and `McpSessionManager`; do not bypass command policy or call private helpers. Keep the fixture below 100 KiB and model actual `createMethodCallMessage`/`funcName` patterns from `imaudio_app_code`.

- [ ] **Step 4: Add the real-project smoke script**

The script scans `source_code/imaudio_app_code`, fails unless it finds `KaraokeManager.setMicVol`, `IMAudioProxy`, and RPC evidence for `querySoundLibrary`, and reports file exclusion and node counts without copying binary resources.

- [ ] **Step 5: Run final verification**

```powershell
npm run workbench:test
npm run workbench:build
node scripts/smoke-imaudio-workbench.mjs
python D:\CodexHome\skills\.system\plugin-creator\scripts\validate_plugin.py D:\CodexHome\personal-marketplaces\im-mcp-codeagent\plugins\im-mcp-codeagent
```

Expected: all tests pass, production build exits zero, the real-project smoke reports representative declarations and RPC evidence, and plugin validation passes.

- [ ] **Step 6: Document and commit**

Update `docs/WORKBENCH.md` with persisted recovery, semantic source index, mock/real readiness, and the smoke command.

```powershell
git add control-server/tests scripts/smoke-imaudio-workbench.mjs docs/WORKBENCH.md
git commit -m "test(workbench): prove executable audio pipeline"
```
