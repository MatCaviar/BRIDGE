# IM MCP CodeAgent

Auto-generate **controllable MCP Servers** from YunOS HDT automotive applications — `analyze → scaffold → generate → gates → build`, with a car-side RPC bridge, deterministic config gates, and dual-end packaging (Claude Code + Codex).

A Claude Code / Codex plugin: skills provide the methodology, a deterministic Node CLI does the heavy lifting, and the host agent (Claude Code or Codex) executes. **No LLM calls inside the plugin.**

---

## What it does

Given a YunOS HDT app (source + manifest), it produces a ready-to-run MCP Server that an upstream agent can call to **actually control the device** (EQ, soundstage, Beosonic, karaoke, car info, …) — not just a throw-stub mock. Reliability comes from:

- **Deterministic generators** (zero app literals — any app, any machine).
- **Two config gates** (`validate-config`: schema + coverage + dispatchable; `wire-check`: proxy wire-format match) — the host agent's only judgment product (`rpc/config.json`) is verified before build.
- **A car-side RPC engine** (delivered to a colleague to install on the device) bridging the host → device over adb/file/sendlink (no network).

## Install (Claude Code)

```bash
/plugin marketplace add https://github.com/<your-org>/im-mcp-codeagent.git
/plugin install im-mcp-codeagent
```

On first session start, the plugin auto-installs its `framework/` + `cli/` deps and builds `cli/dist` (idempotent). Then:

```
/mcp-pipeline ./path/to/your-app
```

Other entry points: `/mcp-verify <project-dir>`, `/mcp-help`.

## Prerequisites for real-device control

The generated server controls the car over an adb/file bridge. Before a real device works:

1. **Colleague builds + installs the car-side `RpcEngine.ts`** into the app and adds the `page://<app>.yunos.com/rpcagent` manifest page (the generator emits both as `car-side/` deliverables).
2. **`adb -host`** reachability to the YunOS device.
3. **ZebraAlfred keep-alive** (or equivalent) — the device otherwise sleeps and sendlink intermittently returns exit -1.

Local (no-device) verification is always available via `mcp-pipeline verify --dir <server>` (install + tsc + tool responsiveness + rpc-bridge readiness). Real-device smoke: `scripts/smoke-real-device.sh` (run gated on step 1 above).

## Architecture

```
im-mcp-codeagent/
├── .claude-plugin/        # Claude Code manifest + marketplace
├── .codex-plugin/         # Codex manifest (dual-end)
├── skills/                # mcp-analyze | mcp-generate | mcp-pipeline | mcp-test (methodology, no LLM calls)
├── commands/              # /mcp-pipeline | /mcp-verify | /mcp-help
├── hooks/                 # SessionStart: polyglot build (run-hook.cmd → session-init.sh)
├── cli/                   # @im/mcp-pipeline-cli — deterministic Node (scaffold/gates/verify/…)
│   ├── src/generators/    # rpc-bridge, yunos-adapter-rpc, car-rpc-engine, …
│   ├── assets/            # car-rpc-engine.ts.template (bundled, de-hardcoded)
│   └── bin/mcp-pipeline.js
├── framework/             # @im/mcp-server-framework (shared dispatch core: constructDbusCall/…)
├── tools/adb/             # bundled adb (self-contained; see LICENSE note)
├── schema/                # analysis.schema.json + fixtures
└── docs/                  # specs + plans + smoke docs
```

The CLI is invoked via a **skill-base-relative path** (`${SKILL_DIR}/../../cli/bin/mcp-pipeline.js`) — self-contained, no PATH/global-link dependency.

## Develop

```bash
cd framework && npm install
cd ../cli && npm install && npx tsc        # build cli/dist
cd ../cli && npx vitest run                # full suite
node scripts/check-manifests.js            # claude/codex manifest drift guard
```

## License

MIT (see [LICENSE](LICENSE)). `tools/adb/` bundles Google's adb under its own terms.
