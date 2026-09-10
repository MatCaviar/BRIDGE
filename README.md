# BRIDGE

**B**uilding **R**eal-device **I**nterfaces via **D**eterministic **G**ated **E**xecution

![version](https://img.shields.io/badge/version-0.2.0-0066cc)

BRIDGE turns application source, API documentation, APKs, and runtime observations into callable tools for upstream agents. Use it with local applications, Android devices, vehicle systems, and simulation benches. Application-specific contracts and adapters live in the consuming project's workspace.

[中文](README.zh-CN.md)

## Install

Add this repository in your Codex plugin settings and install **BRIDGE** (`im-mcp-codeagent`). The existing plugin identifier is retained for upgrades.

For Claude Code:

```text
/plugin marketplace add https://github.com/MatCaviar/BRIDGE.git
/plugin install im-mcp-codeagent@im-mcp-marketplace
```

Ask the installed `bridge-analyze` skill to analyze your own project. Output belongs in that project's directory, separate from the installed plugin. The CLI installs its dependencies and builds on first use; Node.js 20.19+ is required.

## Deliverables

- `analysis.json`: capabilities, parameter constraints, public tool contract, and execution configuration.
- `function-schema.json`: agent-facing definitions, including nested input and output schemas.
- MCP server: the same definitions exposed through `tools/list`, with validated calls through `tools/call`.
- Optional `registry.json` and a project-owned adapter for Android integration.

Choose one tool per capability, or a single configurable channel with `arguments.action`, business parameters, and `arguments.extras`. Replies have `code / message / data / extras`; by default only code `0` means business success. See [tool contracts](docs/tool-contract.md) and [examples](examples/).

## Try locally

From the repository root:

```bash
node e2e/demo-device.mjs
```

In another terminal:

```bash
node cli/bin/mcp-pipeline.js schema --analysis examples/channel-analysis.json --format all --out function-schema.json
node cli/bin/mcp-pipeline.js call --analysis examples/channel-analysis.json --op set_level --args '{"level":35}'
node viz/run.mjs --open
```

The bundled demo is an HTTP simulation with three neutral controls. It does not access a real device. The visualization offers a live pipeline view and an optional agent E2E interface; model-backed tests require your provider credentials.

## Use your own application

```bash
node skills/bridge-analyze/validate-analysis.mjs /path/to/analysis.json
node cli/bin/mcp-pipeline.js schema --analysis /path/to/analysis.json --out /path/to/function-schema.json --format bridge
node cli/bin/mcp-pipeline.js serve --analysis /path/to/analysis.json
```

HTTP adapters are configured in the analysis. For Android, add `--device <serial>` and, when needed, `--user <id>`. Build and deploy the [generic executor](bridge-executor/README.md) with the project's own registry and interface sources. Android user defaults to `0`; no media tools or platform capabilities are added unless selected.

The supported CLI commands are `schema`, `serve`, `call`, and low-level `invoke`. Analysis validation uses the standalone script above.

## Develop

```bash
npm --prefix cli ci
npm --prefix cli run build
npm --prefix cli test
npm --prefix e2e ci
npm --prefix e2e run build
npm --prefix e2e test
node e2e/schema-injection-smoke.mjs --analysis examples/channel-analysis.json
node scripts/check-manifests.js
```

The CLI, validator, registry generator, and visualization consume the same analysis contract. The [analysis skill](skills/bridge-analyze/SKILL.md) describes the project workflow; [E2E](e2e/README.md) covers simulation and agent testing.

## License

[MIT](LICENSE). Bundled Android platform tools retain their own license terms.
