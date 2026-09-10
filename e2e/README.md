# BRIDGE end-to-end tests

## Without a model or device

```bash
npm --prefix cli ci
npm --prefix cli run build
npm --prefix cli test
npm --prefix e2e ci
npm --prefix e2e run build
npm --prefix e2e test
node e2e/schema-injection-smoke.mjs --analysis examples/channel-analysis.json
```

The injection smoke test checks the exported artifact, a real stdio MCP server, and OpenAI/Anthropic schema conversion. CLI contract tests also run a local HTTP adapter and check business failures and parameter validation.

For interactive simulation, start `node e2e/demo-device.mjs`, then invoke `call` or open `node viz/run.mjs --open`. Demo responses include `simulation:true`.

## With an upstream agent

Start the visualization and click its E2E entrypoint. Supply your model API key when prompted. The default config uses an OpenAI-compatible provider; use `--e2e-config /path/to/config.yaml` for your own model configuration. Provider, base URL, and key are controlled by that configuration. Keep credentials outside committed files.

The gateway starts the MCP server for the selected analysis. `config-cockpit.yaml` registers only BRIDGE by default. Add the optional `bridge-ui-server.mjs` server explicitly if Android UI interaction is part of your project; UI control is not a fallback for unrelated requests.

A model choosing the expected tool and the tool executing successfully are separate test outcomes. Tests should check action and business arguments as well as tool name when using channel mode. The UI's batch tests report both selection and execution.

## Own project

```bash
node viz/run.mjs --project-root /path/to/project --analysis /path/to/project/analysis.json --src /path/to/project --port 8651
```

For portable project-local visualizations, copy `viz/` to the output directory, run its `gen.mjs` with absolute analysis/registry paths, and start its `run.mjs` with `--suite-root /path/to/BRIDGE`.

`bridge-serve-wrapper.mjs` auto-discovers Android devices only for ADB analyses; HTTP analyses start directly. Device discovery and ASR are optional integration facilities. The default example does not need either.
