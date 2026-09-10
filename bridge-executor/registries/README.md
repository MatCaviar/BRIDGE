# Registry projection

Generate an Android registry from the same analysis used to serve MCP tools:

```bash
node e2e/analysis-to-registry.mjs /path/to/analysis.json /path/to/registry.json
```

Only selected scopes and non-broken capabilities are included. Operation IDs honor `dispatch.operation`. Media builtins are opt-in. HTTP analyses produce an empty Android registry because execution is handled by the HTTP adapter.

The shipped empty registry accompanies the local HTTP simulation. Target-specific registries belong to each user's output directory.
