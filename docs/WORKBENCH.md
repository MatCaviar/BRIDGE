# BRIDGE Local Visual Workbench

BRIDGE Workbench is a single-window local Electron application for source import, interface discovery, Curate, provenance, gated pipeline execution, and MCP stdio sessions. It does not start an HTTP server or listen on a TCP port.

## Start on Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-workbench.ps1
```

Use `-Install` on the first run when dependencies are absent. The script builds the contracts, local orchestration service, React renderer, and Electron main process, then opens one desktop window. Close the window to stop Workbench and its MCP child processes.

Equivalent npm commands:

```powershell
npm run workbench:build
npm run workbench:start
```

No system browser is opened automatically. No `localhost`, `43140`, or `43141` service is required.

## Workflow

1. Choose a source directory and an MCP output-format reference schema with native file dialogs.
2. The Electron main process filters source files, parses standard JSON, arrays, or adjacent JSON objects, and creates an isolated workspace.
3. Import writes `project.json`, `target-mcp-schema.json`, and a semantic `source-index.json` containing declarations, dependencies, and RPC evidence.
4. Analyze starts automatically and discovers capabilities only from live source evidence. Tool examples inside the schema are formatting references, not requested capabilities.
5. Review the analysis and confirm a non-empty Curate selection. This is the only normal pause.
6. Scaffold, Generate, validation gates, tests, build, schema preview, and verification then run automatically in order.
7. If a stage fails, the pipeline stops immediately and offers retry from that stage.
8. Inspect source-to-capability-to-MCP-to-RPC provenance, then exercise the generated stdio server in MCP Playground.

Projects, stage state, and automation state survive application restart. Analyze uses `source-index.json` for navigation and verifies every promoted capability against live source.

## Fast mock project

For quick visual testing, import:

- Source: `source_code\mock-audio-android`
- Format schema: `schema\mock-mcp-output.schema.json`

The source contains three audio operations. The schema intentionally contains an unrelated `reference_weather_lookup` example; it must never appear in Analyze or coverage findings.

## Local security boundary

- Renderer Node integration is disabled; context isolation and Electron sandboxing are enabled.
- The renderer receives only a typed `window.bridge` allowlist. It cannot submit commands, executables, flags, or arbitrary output paths.
- Filesystem, process, and MCP access remain in the Electron main process.
- Imported paths reject traversal and symlinks; limits are 5,000 files, 5 MiB per file, and 100 MiB total.
- Pipeline commands use an allowlist, `shell:false`, bounded logs, timeouts, persistent postconditions, and confirmation gates.
- Deploy and real MCP calls require the exact project name. Failed gates block real execution.

## Mock and real readiness

`MOCK READY` means a built generated stdio server can be exercised safely. `REAL READY` additionally requires a valid non-deferred wire mapping and all real-execution gates. Deferred source-backed transports remain visible with their blocking reason.

Android projects are indexed from Gradle, manifests, Kotlin, Java, AIDL, XML, and reference files. Android AIDL or vehicle-SDK calls remain deferred until a compatible bridge adapter exists.

## Resource limits

The app creates one BrowserWindow. The Aether field is Canvas 2D, capped at 64 particles, about 45 FPS, and DPR 1.5; it pauses when hidden and honors reduced motion. DevTools and additional windows do not open automatically.

## Verification

```powershell
npm run workbench:test
npm run workbench:build
npm run workbench:smoke:mock
npm run workbench:smoke:mock:live
node scripts\smoke-imaudio-workbench.mjs source_code\imaudio_app_code schema\schema.json
npm run test:smoke --prefix desktop
```

The default mock smoke uses deterministic fixture agents for the two LLM-judgment stages while exercising the real import, Curate, CLI gates, dependency build, generated tests, schema preview, verification, and persistence path. Use `workbench:smoke:mock:live` to run the same fixture through real Codex Analyze and Generate; it requires `codex` on `PATH` and available model quota. The real-project import smoke checks representative audio manager/proxy declarations, `querySoundLibrary` RPC evidence, and project recovery. The Electron smoke must run in a normal interactive Windows user session; restricted CI or sandbox sessions may not permit Chromium GPU subprocesses.

## Troubleshooting

- Local bridge unavailable: start via `scripts\start-workbench.ps1`, not by opening `ui/dist/index.html` directly.
- Analyze cannot start: ensure `codex` is on `PATH` or set `CODEX_EXECUTABLE` before launch.
- Analyze usage limit: wait for the reset time shown in the stage error and retry.
- Empty analysis: verify the source exposes callable manager, proxy, service, or AIDL methods.
- Pipeline failure: inspect the retained stage logs, correct the source/configuration issue, and choose retry from the failed stage.
- MCP start fails: ensure the automation reached `mock_ready` and produced `dist/index.js`.
