# Visualization Gaps & Mock Points — Audit (2026-07-14)

A three-layer audit (UI renderer, control-server orchestration, smoke/scripts/contracts) of
what the BRIDGE visual Workbench **advertises vs. what actually works**. Each finding has a
file:line reference, the gap, and the user-visible symptom.

> **Verified real (do not re-flag):** the renderer is genuinely wired (every button reaches
> `window.bridge` → IPC → control-server, no hardcoded demo rows); every pipeline stage spawns
> a real subprocess (agent stages spawn real `codex exec` / `claude -p`); the MCP stdio session
> uses the real `@modelcontextprotocol/sdk` client (`listTools`/`callTool`); persistence
> (atomic-file, run-log, stage-store) and the security/policy layer (workspace containment,
> confirmation levels, mutation mutex) are all real. The fakery is concentrated in the four
> 🔴 items below — all downstream "last mile to a real backend / real coverage" gaps.

**Status legend:** 🔴 critical (advertised capability unreachable, or fake data shown as real) ·
🟡 mock (real data fetched, but shown static/truncated/overstated) ·
🟢 design / hygiene (decision needed, or dead code).

---

## 🔴 1. "REAL" MCP mode is a label — it never reaches a live backend

- **Where:** `control-server/src/mcp/session-manager.ts:11,63-93`,
  `control-server/src/service/workbench-service.ts:136,138`,
  `cli/src/commands/scaffold.ts:211,242,248,274-279`
- **Gap:** `mock` and `real` sessions spawn **byte-identical** commands; the only difference is
  that `real` pays a `typed-project-name` confirmation and calls `assertRealMcpReady()`. The
  actual mock/live switch is `mock_mode` in the generated project's `conf/config.yaml` — but
  **nothing in the repo ever writes `mock_mode:false`** (scaffold hardcodes
  `adapter: { mock_mode: true }`; `readConfig` falls back to `DEFAULT_CONFIG.mock_mode=true`).
- **Symptom:** a "real" call still hits the generated **mock adapter**, which returns a canned
  `{ success: true }` for every op. The user pays the real-car confirmation and gets the same
  fake success as mock mode. The displayed `realExecutable: true` badge means only "built + has
  an rpc config entry", **not** "can reach a device".
- **Root cause:** the real AIDL / vehicle-SDK bridge adapter does not exist yet, so even if
  `mock_mode:false` were written, there is no live path to fall through to.

## 🔴 2. `register` stage can never run (and `verify` is silently gateway-less)

- **Where:** `control-server/src/pipeline/pipeline-runner.ts:16,200-203`,
  `control-server/src/service/workbench-service.ts:149`, `control-server/src/config.ts:10-17`
- **Gap:** `register` throws `Gateway root is not configured` unless `config.gatewayRoot` is set.
  `gatewayRoot` exists only on the `PipelineRunnerConfig` interface — the sole construction site
  never passes it and `ControlServerConfig` has no gateway setting at all. It is also absent from
  `automaticPostCurateStages` (`workbench-contracts/src/index.ts:211-213`) and from the CLI usage
  text (`cli/src/cli.ts`), while the dispatcher supports it.
- **Symptom:** the UI shows a "注册" stage that the auto-pipeline never runs and that fails
  unconditionally when run manually. `verify` omits the `--gateway` flag, so verification never
  checks gateway registration.
- **Fix direction:** either wire a real gateway root through config, or remove the stage from the
  contract/UI. Currently dead-code-rendered-as-a-stage.

## 🔴 3. Target-coverage is an empty shell end-to-end

- **Where:** `control-server/src/artifacts/artifact-reader.ts:93-95` (server),
  `ui/src/components/CapabilityDiscovery.tsx:2` (renderer)
- **Gap:** the server hardcodes `const targets: TargetProjection[] = []` ("imported schemas are
  never a target catalog"). The renderer still draws a "目标已匹配 X/Y" metric and a target-chips
  block keyed off `targets`.
- **Symptom:** "目标已匹配" permanently shows `0/0` and the target chips never render, despite UI
  copy promising target-vs-source matching. An advertised feature renders but can never show data.
- **Fix direction:** implement target-catalog projection, or delete the target half of the panel.

## 🔴 4. RPC wiring validity is computed but never surfaced

- **Where:** `control-server/src/artifacts/artifact-reader.ts:40-46,121` (server, real),
  no consumer in `ui/src` (renderer)
- **Gap:** the server builds `artifacts.rpc: RpcProjection[]` (per-op `type: dbus|native|deferred|
  unknown`, `valid`) and ships it over IPC, but **no component reads `artifacts.rpc`** — the RPC
  tab only uses `rpcFiles`.
- **Symptom:** the per-tool "is the wiring valid?" signal — a core part of the provenance story —
  is computed then discarded. Users cannot see which ops are `unknown`/`valid:false`.
- **Fix direction:** pure renderer wiring — render `artifacts.rpc` (lowest-risk, high-value).

---

## 🟡 5. `TransformationMap` advertises an edge graph it never draws

- **Where:** `ui/src/components/TransformationMap.tsx:5,7` (edges built real at
  `control-server/src/artifacts/artifact-reader.ts:96-101`)
- **Gap:** header shows `{artifacts.edges.length} 条边`, but the component only maps over
  `capabilities` and never renders `edges`; it is a static `sourceRef → id → status` table, and
  `.slice(0, 18)` silently truncates beyond 18 rows.
- **Symptom:** the "溯源图" claims a traceable `declares/selects/projects/wires` edge graph but
  shows a capped static table.

## 🟡 6. `executable` badge overstates reality

- **Where:** `control-server/src/artifacts/artifact-reader.ts:61-63`
- **Gap:** `mockExecutable = built` (dist/index.js exists); `realExecutable = built && !blocked`.
  Nothing validates the tool is registered in the server or wired to a live backend.
- **Symptom:** "executable" means "the build artifact file exists", not "the tool works".

## 🟡 7. `coverage.targeted/matched` hardcoded to 0, forcing the UI to hide fields

- **Where:** `control-server/src/artifacts/artifact-reader.ts:124-127` (server),
  `ui/src/components/CoverageDashboard.tsx:7` (renderer omits the fields)
- **Gap:** server always emits `targeted:0, matched:0`; the dashboard drops them rather than show
  fake zeros. Honest UI, but the "targeted/matched" coverage concept is unimplemented end-to-end
  and the contract carries dead zeroed fields.

## 🟡 8. Two provenance/dependency lanes have a declared type but no producer

- **Where:** `workbench-contracts/src/index.ts:103` (`SourceEdge.kind:"calls"`),
  `workbench-contracts/src/index.ts:182` (`ProvenanceEdge.relation:"adapts"`)
- **Gap:** no scanner emits `calls` edges (only `contains`/`imports`); artifact-reader emits only
  `declares/selects/projects/wires` (never `adapts`).
- **Symptom:** the call-graph lane and the "adapts" lane in the dependency/provenance
  visualization are permanently empty.

---

## 🟢 9. Auto-pipeline bypasses the confirmation gates (design decision needed)

- **Where:** `control-server/src/pipeline/auto-pipeline.ts:64`
- **Gap:** `execute(stage, { confirmed: true })` synthesizes confirmation for the whole
  post-curate chain, while the contract requires `confirm` for
  `scaffold/generate/test/build/verify/schema_preview`. So the confirmation gates only fire on
  the manual path.
- **Symptom:** the "Deterministic **Gated** Execution" narrative is weakened on the main
  (automatic) path. **Decide:** is auto-confirm an intentional "auto mode" feature, or should the
  auto-pipeline surface per-stage confirmations?

## 🟢 10. Hygiene / dead code / small correctness

| Item | Where | Note |
|------|-------|------|
| Dead module | `ui/src/import/schema-parser.ts` | `parseTargetSchema`/`filterSourceFiles` referenced only by their own test; leftover from the web-app iteration. |
| Dead API | `ui/src/bridge/client.ts:14` | `getProject` has no call site. |
| Wrong restore | `ui/src/state/workbench.tsx:37` | guards on `projects[0]` but restores `projects.at(-1)`; multi-project restore picks the newest, not the last-opened (no last-opened id persisted). |
| Heuristic proxy discovery | `control-server/src/service/workbench-service.ts:157` | `proxyPaths` is a filename regex (`proxy|service|client|controller|manager|.aidl`, cap 200); non-conforming wire-call files are silently excluded from `wire_check`. |
| Regex symbol extraction | `control-server/src/scanner/project-scanner.ts:51-58` | Kotlin/Java/AIDL symbols via regex (TS uses a real AST); feeds `source-index.json` that analyze treats as "verified source evidence" — can miss/over-match. |
| Untyped MCP body | `ui/src/bridge/client.ts:24-26`, `control-server/src/mcp/session-manager.ts:33-47` | `body: any` pass-through; server `validateArguments` ignores unknown args (`if (!property) continue;`), so the UI form can drop schema fields silently. |

---

## Smoke / docs honesty (context, not new bugs)

- `scripts/smoke-mock-workbench.mjs:47-56` stubs `build/test/verify` in the default `smoke:mock`
  (intentional, to avoid an offline-hanging `npm install`; the fixture writes a placeholder
  `dist/index.js`). Consequence: in `smoke:mock` only `validate_config`, `wire_check`,
  `schema_preview`, and persistence run for real. **`docs/WORKBENCH.md` "Verification" overstates
  this** — it says the mock smoke exercises the real dependency build / generated tests; it does
  not. (`smoke:mock:live` does run them for real via Codex.)
- `smoke-imaudio-workbench.mjs` exercises import/index/persistence only (`autoStartAnalysis:false`)
  — it never runs analyze→build on the real `imaudio_app_code` project.
- No smoke anywhere covers: real-agent analyze on a real project, non-deferred wire mappings,
  `register`, `deploy`, `mcp_call_real`, or any renderer/visualization assertion.
  `desktop/tests/local-workbench-smoke.test.ts` only checks a `BRIDGE_DESKTOP_READY` marker +
  no-HTTP; panels are never rendered/asserted.
- Terminal automation state is `mock_ready` only (`workbench-contracts/src/index.ts:199`); there
  is no `real_ready`/`deployed` status, and `DELIVERABLE_CONTRACT.md:38` says a mock-only server is
  "not a final integration deliverable" — yet the visual pipeline terminates exactly there.

---

## Open decisions (need owner input before fixing)

1. **REAL mode:** only make `mock_mode:false` actually take effect (so real genuinely attempts a
   live connection, failing loudly if the adapter is absent), **or** build a real AIDL/vehicle-SDK
   bridge adapter first? (An order-of-magnitude difference in scope.)
2. **`register`:** wire a real gateway, or remove the stage from contract + UI?
3. **Targets:** implement target-catalog matching, or delete the "目标已匹配" UI +
   `coverage.targeted/matched`?
4. **Auto-pipeline confirm:** keep auto-confirm-as-designed, or restore per-stage confirmation?

## Suggested fix order (each split into a small task; minimal-change rule)

| Priority | Action |
|----------|--------|
| P0 | REAL mode: make `mock_mode:false` actually apply (surface "adapter missing" loudly). |
| P0 | `register`: wire gateway config, or drop the stage from the contract/UI. |
| P1 | Render `artifacts.rpc` wiring validity in the UI (pure renderer). |
| P1 | Resolve targets: implement projection or delete the dead panel + coverage fields. |
| P2 | `TransformationMap`: draw real edges, remove the 18-row cap. |
| P2 | Decide the auto-pipeline confirmation semantics. |
| P3 | Hygiene: dead code removal + sync `WORKBENCH.md` Verification wording. |
