# BRIDGE Visual Workbench

BRIDGE Visual Workbench is a localhost-only control plane for source import, interface discovery, Curate, provenance, gated pipeline execution, and real MCP stdio sessions.

## Start

```powershell
npm install
npm run workbench:dev
```

On Windows, the equivalent repository script is:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-workbench.ps1
```

Use `-Install` on its first run when dependencies have not been installed. Press `Ctrl+C` in that terminal to stop both services.

The command first builds the shared contracts, then binds the API to `127.0.0.1:43140` and Vite to `127.0.0.1:43141`. It does not open a browser. Set `CODEX_EXECUTABLE` when Codex is not on `PATH`. Use `npm run workbench:build` for production assets.

## Workflow

1. Import a source directory and target MCP JSON Schema into an isolated workspace.
2. Run Analyze, which invokes Codex with `$mcp-analyze` in workspace-write sandbox mode.
3. Review capabilities and save a Curate selection.
4. Run Scaffold, Generate, validation gates, tests, build, registration, verification, and schema preview.
5. Inspect source → capability → tool → RPC provenance and coverage gaps.
6. Start the generated server and exercise `tools/list` and `tools/call` in MCP Playground.

## Security

- Imported paths reject traversal, absolute paths, drive prefixes, NUL bytes, and symlinks.
- Defaults are 5,000 files, 5 MiB per file, and 100 MiB total.
- Commands use an internal allowlist, `shell: false`, bounded logs, and timeouts. HTTP clients cannot provide executables.
- Mutations require confirmation. Deploy and each real MCP call require the exact project name.
- Failed validation, wire-check, or test gates block downstream real operations.
- Non-loopback server configuration is rejected.

## Resource guarantees

The Aether field uses Canvas 2D, capped at 64 particles, about 45 FPS, and DPR 1.5. It pauses on hidden pages and becomes a CSS poster for reduced motion or unavailable canvas. The UI retains 5,000 log lines and the service retains 500 events. Scripts never launch a browser automatically.

## Mock and real MCP

Both modes communicate with a real MCP stdio process. Mock mode targets generated mock transports. Real mode is visually distinct and requires a fresh typed project-name confirmation per call; it does not bypass generated-server safety checks.

## Troubleshooting

- API offline: check port 43140 and run `npm run workbench:api`.
- Analyze/Generate cannot start: configure `CODEX_EXECUTABLE`.
- Scaffold blocked: save a non-empty Curate selection.
- Build blocked: resolve validation and wire-check findings.
- MCP start fails: build the generated server and verify `dist/index.js`.
