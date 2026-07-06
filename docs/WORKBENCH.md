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

## Agent backend (Codex / Claude Code)

The `analyze` and `generate` stages are driven by an agent CLI. Two backends are supported and selected at startup from the `AGENT_BACKEND` environment variable:

| `AGENT_BACKEND` | CLI resolved by | Default executable |
| --- | --- | --- |
| `codex` (default) | `CODEX_EXECUTABLE` env, else `scripts\resolve-codex-executable.ps1` | `codex` |
| `claude` | `CLAUDE_EXECUTABLE` env, else `scripts\resolve-claude-executable.ps1` | `claude` |

### How to switch

Switching means: set `AGENT_BACKEND`, then (re)start Workbench. The choice is read once at startup.

**Windows (PowerShell) → Claude Code:**

```powershell
$env:AGENT_BACKEND = "claude"
powershell -ExecutionPolicy Bypass -File scripts\start-workbench.ps1
```

**Windows (cmd.exe) → Claude Code:**

```cmd
set AGENT_BACKEND=claude
powershell -ExecutionPolicy Bypass -File scripts\start-workbench.ps1
```

In cmd, use `set` with **no spaces around `=`**; the variable stays set for that cmd session and is inherited by the launcher. Clear it with `set AGENT_BACKEND=` (or `set AGENT_BACKEND=codex`) to go back to Codex.

**Windows (PowerShell) → back to Codex (default):**

```powershell
Remove-Item Env:\AGENT_BACKEND   # or: $env:AGENT_BACKEND = "codex"
powershell -ExecutionPolicy Bypass -File scripts\start-workbench.ps1
```

**Non-Windows / plain npm:**

```bash
AGENT_BACKEND=claude CLAUDE_EXECUTABLE="$(which claude)" npm run workbench:start
```

The startup log prints the active backend, e.g. `Agent backend: claude (C:\...\claude.cmd)`, so you can confirm the switch took effect.

### Notes

- Only `analyze` / `generate` use the selected backend. The deterministic stages (`curate`, `scaffold`, `validate_config`, `wire_check`, `build`, `test`, `schema_preview`, `verify`) always run through `cli/bin/mcp-pipeline.js` regardless of backend.
- The choice is read once at startup; restart Workbench to change it. An in-flight `analyze` keeps its original backend until it finishes.
- If the CLI is not on `PATH`, point the matching env var at an absolute path: `CODEX_EXECUTABLE` or `CLAUDE_EXECUTABLE`.
- Claude runs headless: `claude -p "<prompt>" --dangerously-skip-permissions --output-format text` with `cwd` = the project workspace root. Codex runs `codex exec --sandbox workspace-write --skip-git-repo-check --ephemeral --color never --cd <root> <prompt>`.

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
- Analyze cannot start: ensure the active agent backend CLI is on `PATH` or set `CODEX_EXECUTABLE` (`AGENT_BACKEND=codex`) / `CLAUDE_EXECUTABLE` (`AGENT_BACKEND=claude`) before launch.
- Analyze usage limit: wait for the reset time shown in the stage error and retry.
- Empty analysis: verify the source exposes callable manager, proxy, service, or AIDL methods.
- Pipeline failure: inspect the retained stage logs, correct the source/configuration issue, and choose retry from the failed stage.
- Stage hangs / `timed out`: a stage that does not finish within its deadline (10 min for agent stages) is treated as a hung subprocess — the runner kills the whole process tree (Windows `taskkill /T /F`, so `cmd.exe → npm → tsc` grandchildren can't keep the pipes open) and automatically retries once before failing. Watch for `[bridge] Stage <op> did not finish … retrying (attempt 2 of 2)…` lines in the log box / `run.log`; a final `timed out after N attempts` means both tries hung (usually a file lock, a hung agent, or a blocked network call). Set `retryOnTimeout: false` on a `CommandSpec` to opt a stage out.
- No console windows: every spawned process (pipeline stages, the generated MCP server, and the `npm`/`tsc`/`vitest` runs inside `build`/`test`/`verify`) passes `windowsHide`, so no `cmd.exe` box flashes during a run.
- MCP start fails: ensure the automation reached `mock_ready` and produced `dist/index.js`.

### Persisted run logs

Everything shown in the bottom log box is also appended to disk so it survives restarts:

```
.workbench-runtime\<project-id>\.workbench\logs\run.log
```

`log` events are written raw (exactly what the box shows); `stage` / `pipeline` / `mcp` / `artifact` / `project` events are written as `== [timestamp] type · detail ==` marker lines between them, so the file reads as a trace of the whole run. It is append-only across retries on the same project. Open it in any editor, or tail it while a run is in progress.
