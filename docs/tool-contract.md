# Public tool contracts

`analysis.json` drives static function definitions, MCP `tools/list`, call validation, and execution mapping. It is a project artifact; the installed BRIDGE plugin remains application-independent.

## Individual and channel tools

The default `individual` mode exposes each selected capability's `id` as a tool name. `toolContract.mode: "channel"` exposes one tool with a configured `name`. Its input has an action discriminator, business arguments, and optional context. For example, [channel-analysis.json](../examples/channel-analysis.json) exposes:

```json
{
  "name": "device_channelCall",
  "arguments": {
    "action": "adjust_level",
    "level": 35,
    "extras": {
      "queryId": "q-01",
      "voiceZone": 0,
      "isAppPlayTts": true,
      "source": "localAgent",
      "sourceId": "desktop-agent",
      "callId": "c-01"
    }
  }
}
```

This is a **call instance**. Its function schema describes types, required fields, enums, and constraints instead of concrete values. Channel schemas use `oneOf` with one branch per action, so parameters for one action cannot silently appear in another. `actionField` and `contextField` rename the default `action` and `extras` keys.

`publicAction` controls the value exposed to the agent. `dispatch.operation` controls the target operation; `dispatch.parameterMap` maps public parameter names to target names. In the example above, the HTTP adapter receives `action: "set_level"` and `intensity: 35`. Descriptions and public names stay independent of backend identifiers.

## Parameters and metadata

Parameters support string, integer, number, boolean, object, and array types, plus aliases such as `str`, `int`, and `List[str]`. Define nested object `properties` as parameter arrays, and array `items` recursively. Use `enum`, `minimum/maximum`, `minLength/maxLength`, `pattern`, and `minItems/maxItems` as appropriate. Unknown object fields are rejected by default; set `additionalProperties:true` explicitly for open maps. `optional:true` and `defaultValue` control omission; an object's explicit `required:[]` makes all its declared fields optional.

Capabilities may carry `utterances` — PRD-sourced example phrasings such as "帮我把麦克风音量调到7". They are rendered into each channel `oneOf` branch description (or individual tool description) as `Example utterances:`, letting the upstream agent match user phrasing to actions in-band. A PRD-only draft — every capability `broken`, no transport or mechanism — passes validation and exports with `--include-broken` for review; execution stays blocked until an execution chain exists.

`toolContract.context` uses the same parameter definitions. To bind a context field to a trusted host value:

```json
{
  "contextBindings": {"sourceId": {"env": "BRIDGE_SOURCE_ID"}}
}
```

Declare `sourceId` in `context` first. Bound values overwrite any model-provided value. String fields keep their literal environment value; other types use JSON encoding. Missing or invalid host values fail before dispatch. Authentication headers use `transport.headerEnv`, mapping header names to environment-variable names; they are never exposed as model arguments.

Cross-field rules beyond the supported schema vocabulary, such as equal lengths for two lists or domain-specific state transitions, belong in the project adapter's validation. Describe them in the tool contract and test their failures.

## Reply envelope

```json
{"code":0,"message":"success","data":{},"extras":{}}
```

By default only numeric `0` is a business success code. An error such as `1400` or `1401` remains unchanged and sets MCP `isError:true`. The envelope is available in both `structuredContent` and JSON text content; every tool advertises `outputSchema`.

`toolContract.response` can set `codeField`, `messageField`, `dataField`, `extrasField`, and `successCodes`. Set `requireCode:true` for a target that promises an explicit business code. Otherwise a response without a code is normalized from transport success. Transport errors and invalid arguments never count as successful tool calls.

`response.errorCodes` declares the business error-code table — one entry per code with `code`, `message`, and optional `description` (codes must be unique and must not collide with `successCodes`):

```json
{"successCodes":[0],"requireCode":true,"errorCodes":[
  {"code":1400,"message":"value out of range","description":"a numeric argument violates its declared bounds"},
  {"code":1401,"message":"illegal value","description":"a string argument is outside its declared enum"}
]}
```

The table is rendered into the exported tool description next to the success codes, so upstream agents see failure semantics in-band across `mcp`, `openai`, `anthropic`, and `bridge` exports as well as `tools/list`. Channel metadata — `toolContract.version` (contract version), `toolContract.timeoutMs` (declared channel timeout), and `toolContract.clientPackage` (calling application package) — is exported the same way under `Channel:`. Both blocks are additive description suffixes; they do not alter input/output schemas.

## Execution

- HTTP: `transport: {"type":"http","url":"http://127.0.0.1:8766/call","timeoutMs":8000}`. BRIDGE POSTs `{name,arguments}` and reads the JSON reply. The project adapter may use any local SDK, process, socket, simulator, or device API behind that endpoint.
- Android: omit `transport` and define each capability's supported mechanism. Supply `--device` to serve/call, and configure the [generic executor](../bridge-executor/README.md). Registry operation names use the same dispatch mapping.

Default selected scope is `core`. Set `deliveryScopes` to include `shared` or `platform`. `broken` capabilities are omitted; `--include-broken` enables discovery for inspection but still blocks their execution. Android media builtins require explicit `builtins`; HTTP and channel integrations declare media operations as ordinary capabilities.

`preconditions` are trusted runtime requirements, separate from schema annotations. Host embeddings can supply a `preconditions` provider value, or CLI users can pass `--preconditions-file` containing `{"expiresAt":<epoch-ms>,"values":{"ready":true}}`. Refresh the snapshot from real state; expired or missing values fail closed. Android checks its own device-side snapshot as well.

## Export and test

`schema --format bridge|mcp|openai|anthropic|all` exports the same input contract. BRIDGE's friendly `arguments` entries retain their full JSON Schema under `schema`; complete channel branch rules live in `inputSchema.oneOf`.

Use `call --analysis ... --op <capability-id> --args '{...}'` to exercise exactly the MCP validation and response path. For a raw public call, use `--name <public-tool>` and include the action yourself. Gateway provider names may be namespaced as `bridge__device_channelCall`; the MCP tool itself retains its configured name.

Use the schema injection smoke test to compare full definitions across file, stdio, and provider formats. Run adapter tests separately from model-selection tests, and label simulation output as simulation.
