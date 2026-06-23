---
name: mcp-generate
description: Extract rpc/config.json wire-specs from proxy source code for the scaffolded rpc-calling project
---

> 本 skill 的 base dir = 加载时显示的路径；CLI 调用形式为 `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`（${SKILL_DIR} 即本 skill 的 base dir）。

# MCP Generate

Read the scaffolded MCP Server project and the original YunOS app source code, then produce the ONE file that only an LLM can produce: `rpc/config.json` — the op→wire-spec map that wires each capability to its real D-Bus / native call, so the generated adapter controls the car through the RPC bridge instead of throwing.

**New reality (SP-B):** scaffold now **deterministically** produces both the RPC bridge **and** the `yunos-adapter.ts`. Every adapter method is already `await rpcCall("<cap.id>", {<params>}, adbConfig)` + a map-by-name DTO (no `throw`). The host agent's **ONLY** judgment product this step is `rpc/config.json`. No adapter source is written here.

## What scaffold already generates (DO NOT regenerate these)

The scaffold CLI command (`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" scaffold ...`) already deterministically generates:
- `src/rpc/rpc-types.ts`, `rpc-engine.ts`, `rpc-client.ts` — the RPC bridge (from Phase-1, de-hardcoded; `RPC_URL` = `page://<domain>/rpcagent`)
- `src/executors/adb-executor.ts` — sendlink + shell executor
- `src/adapters/yunos-adapter.ts` — production adapter, every method → `rpcCall(op, args)` + map-by-name DTO (no `throw`)
- `src/adapters/types.ts` — IAdapter interface + all DTO types
- `src/adapters/mock-adapter.ts` — mock adapter with error injection
- `src/adapters/index.ts` — adapter factory (mock/production switch)
- `src/tools/<domain>.ts` — tool handlers per domain with Zod schemas, safety guard, error handling
- `src/tools/registry.ts` — tool registry with safety levels
- `src/server.ts` — server wiring with safety guard for sensitive tools
- `src/shutdown.ts`, `src/config.ts`, `src/index.ts` — infrastructure
- `conf/config.yaml` — server configuration (incl. `adb:` block)
- `car-side/RpcEngine.ts`, `car-side/manifest-page.json` — car-side deliverables for the colleague

## What this Skill generates

Only `rpc/config.json` — the op→wire-spec map (`op` = analysis `capability.id`). This is the single judgment artifact: reading the app's proxy/manager source to extract how each capability is actually called on the wire. Everything else is deterministic.

## Input

The user runs `/mcp-generate` from within the scaffolded project directory, or provides the project path. Example: `/mcp-generate ./mcp-aipet`

## Prerequisites

Before running this Skill:
- The scaffold CLI command (`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" scaffold ...`) has been run — the project directory exists with all auto-generated files, including the RPC bridge and the rpc-calling `yunos-adapter.ts` (NO `throw`)
- `analysis.json` exists with capabilities, params, returns, safety levels, SDK calls, error codes — each capability carries a `sourceRef` pointing into the app source
- The original YunOS app source code is accessible (referenced by `analysis.json` sourceRef fields) — the proxy/manager `.ts` files are the ground truth for wire extraction

## Process

### Step 1: Read Context

Read these files:
1. `analysis.json` — capabilities, params, returns, safety levels, SDK calls; each capability's `sourceRef` points at the proxy/manager source
2. The original YunOS app source code (referenced by each capability's `sourceRef`) — the proxy/manager `.ts` files where the real D-Bus / native calls live

You will **create** `rpc/config.json` from scratch (the scaffold does not emit it) — populating one `op` entry per capability in Step 2.

### Step 2: Extract wire-specs into `rpc/config.json`

For each capability in `analysis.json`, extract how it is actually called on the wire and write one `op` entry (the key **is** the capability `id`).

**Procedure:**
1. **Locate the proxy/manager source** via the capability's `sourceRef`. Read that file. The proxy source is the ground truth — `analysis.json` is interface-level only (method-name strings, no D-Bus wire details).
2. **Extract the wire-spec** by reading the proxy's actual call:
   - **D-Bus** (the common YunOS case): the proxy uses `createMethodCallMessage("<method>")`, then `writeString(JSON.stringify({ funcName: "<...>", data: {...} }))`, and reads the reply via `readJSON()` / `readString()`. Extract:
     - `bus` / `path` — from the proxy's constructor / `BUS_NAME` / `BUS_PATH` constants
     - `method` — the string passed to `createMethodCallMessage` (e.g. `"request"`)
     - `arg` — the object written: `{ funcName, data: { ... } }`. Parameterize call inputs with `${var}` placeholders matching the capability `params` names (single placeholder, type-preserving — Phase-1 TDD bug fix)
     - `stringify` — the dotted paths inside `arg` that must be `JSON.stringify`-ed before send (e.g. `["data"]`)
     - `reply` — `readJSON()` → `"json"`; `readString()` → `"string"`; typed reads → `"int"` / `"double"` / `"bool"`
   - **Native** (`require`/factory + method): extract `require`, optional `factory`, `method`, and the literal `args` array.
3. **Write the entry** into `rpc/config.json` with `op` = `capability.id` (the key under which the spec is stored).
4. **Run both gates** (these are deterministic CLI gates — the reliability spine). On failure, read the gate's error message, fix the config, and re-run. Retry up to 3 attempts; if still failing, surface the gate errors to the user and stop.

   ```bash
   node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate_config rpc/config.json --analysis <analysis.json>
   node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" wire_check rpc/config.json --proxy <path/to/Proxy.ts>
   ```

   - `validate_config` checks: schema conformance (RpcConfig), **coverage** (every capability has a matching `op`), and **dispatchable** (`constructDbusCall`/`constructNativeCall` runs against sample args synthesized from `cap.params` without crashing, `${var}` interpolation and `stringify` correct).
   - `wire_check` statically parses the proxy source for the shared `createMethodCallMessage("m") ... funcName: "f"` pattern, reconstructs the expected wire, and compares it against `constructDbusCall(config[op])`. A mismatch means your extracted `bus`/`path`/`method`/`arg`/`stringify` does not match the real proxy — fix the entry and re-run.

**Worked example — `soundstage.read` / `soundstage.set`** (copied verbatim from the Phase-1 reference `imaudio_app_code/rpc/config.json`; the proxy is `imaudio_app_code/ts/proxy/AudioPolicyProxy.ts`, whose `getSoundStage` / `setSoundStage` use `createMethodCallMessage("request")` + `writeString(JSON.stringify({ funcName, data }))` + `readJSON()`):

```json
{
  "soundstage.read": {
    "type": "dbus",
    "bus": "com.yunos.audiopolicyservice",
    "path": "/com/yunos/audiopolicyservice",
    "method": "request",
    "arg": { "funcName": "audiopolicyservice.yunos.com/baseModeules/requstGetSoundEffectsMode" },
    "reply": "json"
  },
  "soundstage.set": {
    "type": "dbus",
    "bus": "com.yunos.audiopolicyservice",
    "path": "/com/yunos/audiopolicyservice",
    "method": "request",
    "arg": {
      "funcName": "audiopolicyservice.yunos.com/baseModeules/requstSetSoundEffectsMode",
      "data": { "mode": "${mode}", "fade": "${fade}", "balance": "${balance}" }
    },
    "stringify": ["data"],
    "reply": "json"
  }
}
```

Note how this mirrors the proxy exactly: `method` `"request"` matches `createMethodCallMessage("request")`; `arg.funcName` matches the proxy's `funcName` constant; the `set` op's `data` uses `${mode}`/`${fade}`/`${balance}` placeholders for the call inputs and is listed under `stringify` because the proxy does `JSON.stringify({ ..., data })`. `reply` is `"json"` because the proxy reads via `readJSON()`.

### Step 3: Verify via the gates

The two gates from Step 2.4 **are** the verification — they are deterministic and authorless. Do not hand-wave: both must print success before this step is complete. If either fails after 3 fix attempts, stop and surface the errors.

(TypeScript compilation / test runs happen in the pipeline's `test` and `build` steps, not here — this Skill produces only `rpc/config.json`.)

## Quality Checklist

- [ ] Every capability in `analysis.json` has a matching `op` (= `capability.id`) in `rpc/config.json` — no missing, no extra
- [ ] Each D-Bus `op`'s `bus`/`path`/`method`/`arg`/`stringify`/`reply` is copied from the real proxy source, not guessed
- [ ] `${var}` placeholders match the capability `params` names; `stringify` paths match the proxy's `JSON.stringify` targets
- [ ] `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate_config rpc/config.json --analysis <analysis.json>` passes (schema + coverage + dispatchable)
- [ ] `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" wire_check rpc/config.json --proxy <Proxy.ts>` passes (wire matches the proxy source)
- [ ] No `throw "not implemented"` anywhere in the generated `yunos-adapter.ts` (confirm the scaffolded adapter calls `rpcCall` per method — do **not** edit the adapter here)
