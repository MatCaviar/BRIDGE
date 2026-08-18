# Deliverable Contract

This plugin should not be judged by whether it generated a folder. A successful run produces a reviewable, runnable MCP suite with four audiences.

## Primary Agent-Facing Artifact

The full product is the MCP suite. Its primary agent-facing artifact is the upstream-agent tool surface:

- `tools-schema.json`, produced by `mcp-pipeline schema_preview <analysis.json> [<rpc/config.json>]`
- `src/tools/schema.ts`, emitted inside the generated MCP server

This schema is what Claude, Codex, or another MCP-capable agent sees: tool names, descriptions, parameter schemas, safety annotations, and executability flags. If this surface is ambiguous, incomplete, duplicated, or inconsistent with runtime behavior, the delivery is not complete.

## Delivery Bundle

| Audience | Deliverable | Location | Purpose |
|---|---|---|---|
| Upstream agent | Function schema surface | `tools-schema.json`, `src/tools/schema.ts` | The exact callable API injected into the model. |
| MCP host | Runnable MCP Server | Generated server directory, `dist/` after build, `conf/config.yaml` | The stdio server that hosts the tools for Claude/Codex-compatible clients. |
| App/device integrator | RPC wire contract | `rpc/config.json`, `src/rpc/rpc-engine.ts`, `car-side/` | The bridge from tool calls to real app/device operations. |
| Reviewer | Verification evidence | `.mcp-pipeline/<app>/state.json`, `.mcp-pipeline/test-results.json`, command output from gates | The audit trail for schema validity, wire coverage, build, discovery, and tool-call responsiveness. |

## Done Criteria

1. `tools-schema.json` exposes every selected capability exactly once.
2. Every tool has a concrete description, concrete input schema, and correct safety annotations.
3. Tools with missing wire mappings are explicitly marked `executable:false`; they are not silently exposed as working tools.
4. `mcp-pipeline validate <analysis.json>` passes semantic validation, including duplicate capability and parameter checks.
5. `mcp-pipeline validate_config <rpc/config.json> --analysis <analysis.json>` passes and rejects unknown operations, unknown deferred tools, and invalid templates.
6. `mcp-pipeline wire_check <rpc/config.json> --proxy <proxy.ts>` proves config operations match real proxy wire calls.
7. `mcp-pipeline build --dir <server>` produces `dist/index.js`.
8. `mcp-pipeline verify --dir <server>` discovers and calls business tools, not only `health_check`.
9. The generated `car-side/` artifacts can be handed to the device-side integrator without reverse-engineering the pipeline.

## Non-Goals

- The CLI does not make LLM judgment calls internally.
- A mock-only server is not a final integration deliverable.
- Local verification does not claim real-device success unless the car-side bridge is installed and reachable.
- The generated MCP server is not the only deliverable; it is the runtime wrapper around the tool schema and RPC contract.
