---
name: mcp-generate
description: Use when the scaffolded MCP Server project exists and rpc/config.json (the op→wire map) must be authored from the app's proxy/manager source — the sole LLM-judgment step before the gates and build. Not for scaffolding (deterministic) or analyzing (separate skill).
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> CLI: `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...` (if `${SKILL_DIR}` does not expand, use `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js` instead).

# MCP Generate

Read the scaffolded MCP Server project and the original YunOS app source code, then produce the ONE file that only a host codeagent can produce: `rpc/config.json` — the op→wire-spec map that wires each capability to its real D-Bus / native call, so the generated MCP server can dispatch tool calls through the RPC bridge instead of pretending a mock is the final integration.

## Iron Law

```
NO INVENTED WIRE
```

Every non-`_deferred` op in `rpc/config.json` must have its `bus`/`path`/`method`/`interface`/`arg.funcName`/`arg.data`/`writes`/`stringify`/`reply`/`replyParts` traceable **verbatim** to a real call site in the app's proxy/manager source. If you cannot find real evidence → write it into `_deferred` with the reason. No exceptions.

**Violating the letter is violating the spirit** — there is no "I adapted it but kept the spirit." Inferring a `bus` name from a naming pattern, filling `funcName` with a "format-matching" string, assuming the wire is correct because `validate_config` passed, or copying an entry from an old config/fixture that has no source backing — all of these are fabrication, all are violations.

**Why**: the wire you extract makes the generated MCP server **actually emit this D-Bus/native call on the real car**. A fabricated `funcName`/`bus` does not error — it silently controls the wrong thing. This is the safety-critical joint of the whole chain; "config passes the gates" ≠ "the wire is real".

## Preempting common excuses

| What you might think | Reality |
|---|---|
| "validate_config passed, so the wire should be right" | validate_config only checks schema + coverage + dispatchable; it **never reads source** and has zero judgment on wire truth |
| "wire_check will catch it, passing is enough" | wire_check verifies the proxy + funcName you pass in exist literally; it does not read bus/path semantics, and is not sufficient proof the wire is correct |
| "Not found in the proxy, but the fixture / old config has this bus name" | A fixture is not ground truth; the proxy source is. Not found → `_deferred`, do not copy the fixture |
| "This funcName matches the naming pattern, so it should be right" | funcName is a precise interface path and must come verbatim from the source; "matches a pattern" ≠ exists |
| "The file sourceRef points to has no such method; maybe it was refactored" | grep the app source for the real proxy/manager (by the capability's object/action, the bus name, the `createMethodCallMessage` call site). Still not found → `_deferred` + reason |
| "Ship a version first, verify later" | Fabricated wire on the car = silent mismatch. There is no "first fabricated version"; only verified or deferred |

## Judgment criteria (what counts as a verified wire)

An op counts as **verified** if and only if, for **every field**, you can point to "this comes verbatim from this spot in the source":
- `bus`/`path` ← the proxy's constructor / `BUS_NAME`/`BUS_PATH` constants
- `method` ← the literal argument to `createMethodCallMessage("<this>")`
- `arg.funcName` ← the literal value of `funcName:` in the source's `writeString` object
- `arg.data`'s `${var}` ← one-to-one with the capability `params` names (single placeholder, type preserved)
- `stringify` ← matches the source's `JSON.stringify(...)` target path
- `reply` ← `readJSON()`→`json` / `readString()`→`string` / typed read → `int`/`double`/`bool` (use `int` for the value, **not `int32`**; `int32` is only valid for `writes[].kind`/`replyParts[].kind`; putting it in `reply` is rejected by `validate_config`)

If any field cannot be pointed to a source location → this op is not verified: either keep grepping, or move it to `_deferred`. **Both gates green ≠ these fields are correct** — the gates only check the lower bound.

Scaffold **deterministically** produces the schema-first MCP runtime: `TOOL_SCHEMA`, `TOOL_REGISTRY`, server wiring, the weak-typed `rpcCall(op, args)` adapter, the RPC bridge, and the car-side artifacts. Your **only** judgment product this step is `rpc/config.json`. Do not edit generated adapter/server/tool source here; fix the judgment artifact and rerun the deterministic gates.

## What scaffold already generates (DO NOT regenerate these)

The scaffold CLI command (`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" scaffold ...`) already deterministically generates:
- `src/tools/schema.ts` — the agent-facing `TOOL_SCHEMA` single source of truth, later projected by `schema_preview`
- `src/tools/registry.ts` — capability metadata and safety levels
- `src/server.ts` — MCP tools/list + tools/call wiring, with safety guard for sensitive tools
- `src/adapters/index.ts` — the generalized `rpcCall(op, args)` adapter factory; mock mode returns deterministic placeholders, real mode routes to the RPC bridge
- `src/rpc/rpc-types.ts`, `rpc-engine.ts`, `rpc-client.ts` — the RPC bridge (de-hardcoded; `RPC_URL` = `page://<app>.yunos.com/rpcagent`)
- `src/executors/adb-executor.ts` — sendlink + shell executor
- `src/config.ts`, `src/index.ts` — infrastructure
- `conf/config.yaml` — server configuration (incl. `adb:` block)
- `car-side/RpcEngine.ts`, `car-side/manifest-page.json` — car-side deliverables for the colleague

## What this Skill generates

Only `rpc/config.json` — the op→wire-spec map (`op` = analysis `capability.id`). This is the single judgment artifact: reading the app's proxy/manager source to extract how each capability is actually called on the wire. Everything else is deterministic.

## Input

The user runs `/mcp-generate` from within the scaffolded project directory, or provides the project path. Example: `/mcp-generate ./mcp-aipet`

## Prerequisites

Before running this Skill:
- The scaffold CLI command (`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" scaffold ...`) has been run — the project directory exists with all auto-generated files, including `src/tools/schema.ts`, `src/server.ts`, `src/adapters/index.ts`, and the RPC bridge
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
2. **Extract the wire-spec** by reading the proxy's actual call. The engine (DbusSpec) models **5 wire patterns** — pick the one the proxy actually uses (read the source, don't assume):
   - **Common fields (all D-Bus patterns):**
     - `bus` / `path` — from the proxy's constructor `super({ busName, busPath, ... })` or `BUS_NAME`/`BUS_PATH` constants
     - `method` — the literal string passed to `createMethodCallMessage("<…>")`
     - `interface` — **read the proxy's actual interface** (the 3rd arg to `createInterface` / `super({ interface })`). If it equals `bus + ".interface"` (the BaseProxy default), **omit** `interface`. If it is the bare bus name or any other literal (common for `mafservice`/`music` proxies that pass `interface: "<bus>"`), **set `interface` explicitly** — the engine defaults to `bus+".interface"`, which would be WRONG. This is a frequent silent-failure; `wire_check` provenance now catches a mismatched `interface`.
   - **Pattern A — single JSON write (most common):** proxy does `createMethodCallMessage("m")` + `writeString(JSON.stringify({ funcName, data }))` + one read. Use `arg` + optional `stringify` + `reply`.
     - `arg` — the object written: `{ funcName, data: { ... } }`. Parameterize inputs with `${var}` matching capability `params` names. A **single** `${var}` placeholder preserves the value's type (number stays number, object stays object) — so `arg: { body: "${info}" }` passes the whole `info` object through verbatim (no need to flatten).
     - `stringify` — dotted paths inside `arg` that the proxy `JSON.stringify`s before send (e.g. `["data"]` when the proxy nests a stringified blob).
     - `reply` — `readJSON()`→`"json"` / `readString()`→`"string"` / `readInt32()`→`"int"` / `readDouble()`→`"double"` / `readBool()`→`"bool"`. **`reply` may only take one of these 5 values: `json`/`string`/`int`/`double`/`bool`.** Common pitfall: `readInt32()` has "32" in the function name, but the mapped `reply` value is **`"int"` (no 32)**; `"int32"` may only appear in `writes[].kind`/`replyParts[].kind` — **putting it in `reply` is rejected by `validate_config`** (`dbus.reply must be one of json,string,int,double,bool`). Choose by `returns.type`: `integer`/`long`→`"int"`, `float`/`double`→`"double"`, `boolean`→`"bool"`, `string`→`"string"`, `object`/struct→`"json"`.
   - **Pattern B — positional multi-write:** proxy does several `writeString(...)` / `writeInt32(...)` in order (NOT one `writeString(JSON.stringify(...))`). Use **`writes`** (an ordered array) instead of `arg`. Each item `{ kind, value }`: `kind` = `"string"`|`"int32"`|`"double"`|`"bool"`|`"json"`; `value` = literal or `${var}`. `kind:"json"` ⇒ `writeString(JSON.stringify(value))`; `kind:"string"` ⇒ bare `writeString(value)` (no JSON quotes). This is how you wire capabilities the old engine had to defer — **6 positional writes is fine, not "partial"**.
   - **Pattern C — bare-string write:** proxy does a single `writeString(cpType)` with a raw string (not JSON). Use `writes: [ { kind: "string", value: "${cpType}" } ]` — `kind:"string"` writes the value bare; `kind:"json"` would wrongly wrap it in quotes and corrupt the value.
   - **Pattern D — multi-segment read:** proxy reads several values (`readString()` then `readInt32()`, etc.). Use **`replyParts`** (ordered array of `{ kind }`); the engine returns an array of the segments in order. Omit `replyParts` for the common single-read case (then `reply` drives one read).
   - **Device-context vars:** if the proxy injects device state (VIN from `CarInfoModel`, auth token, etc.) into the wire — i.e. a value the agent cannot know and the generic engine cannot read — template it as **`${__device__.vin}`** and ensure `analysis.app.deviceSources` lists `"vin"`. The car-side engine resolves `__device__.*` on-device and **fail-closes** (throws, never leaks the marker) if unresolved. Do NOT make device-injected values into agent `params` (the agent can't supply them) and do NOT hardcode a fake — use `${__device__.X}`.
   - **Native** (`require`/factory + method): extract `require`, optional `factory`, `method`, and the literal `args` array (each item a `${var}` or `{ expr: "arithmetic" }`).
3. **Write the entry** into `rpc/config.json` with `op` = `capability.id` (the key under which the spec is stored).

**Handling a sourceRef that does not match the real source (never fabricate wire):**
1. If the method the sourceRef points to does not exist in the real source or the method name does not match, **do not fabricate wire from a fixture** — search the app source for the capability's real proxy/manager (grep by the capability's object/action keywords, the D-Bus bus name, the `createMethodCallMessage` call site).
2. Found the real proxy → extract the real wire-spec from its `createMethodCallMessage` + `funcName` + `stringify` pattern and write it into the config (verified).
3. **First rule out "wireable but misjudged as defer"** (the most common cause of lost capabilities): positional multi-write (`writeString`/`writeInt32` × N), bare-string write, and multi-segment read **are all dbus RPC** (see Patterns B/C/D above) — **they must be wired via `writes`/`replyParts`, never deferred**. "Many params / many writes" is not a defer reason — the engine supports any number of segments. Only capabilities that **genuinely do not go through dbus/native RPC** (e.g. `launch_app` = adb sendlink, `appstatus` = in-process read, pure UI page navigation) are deferred: write a `_deferred` allow-list at the top level of `rpc/config.json` — `"_deferred": { "<cap.id>": "<reason>" }` (e.g. `"_deferred": { "launch_app": "adb sendlink — not RPC" }`). **Do not write a wire-spec for it**; registering it in `_deferred` means intentionally not providing a wire. `validate_config`'s coverage gate exempts capabilities registered in `_deferred` and returns them as informational `deferred` fields.
4. In the report, clearly distinguish each capability: `verified` (wire checked against source) vs `deferred` (written into `_deferred` + reason). **Never emit inferred/guessed wire as verified.**
5. `validate_config` requires every capability in the config to be dispatchable; deferred ones only go into `_deferred` (not into wire-specs) — the coverage gate passes them through (they are outside the RPC model, registered machine-readably in `_deferred`).

4. **Run both gates** (these are deterministic CLI gates — the reliability spine). On failure, read the gate's error message, fix the config, and re-run. Retry up to 3 attempts; if still failing, surface the gate errors to the user and stop.

   ```bash
   node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate_config rpc/config.json --analysis <analysis.json>
   node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" wire_check rpc/config.json --proxy <path/to/Proxy.ts>
   ```

   - `validate_config` checks: schema conformance (RpcConfig), **coverage** (every capability has a matching `op`), and **dispatchable** (`constructDbusCall`/`constructNativeCall` runs against sample args synthesized from `cap.params` without crashing, `${var}` interpolation and `stringify` correct).
   - `wire_check` now validates bidirectionally. **Forward (proxy→config)**: parses the proxy's `createMethodCallMessage("m") ... funcName: "f"` pattern, rebuilds the expected wire, and compares it against `constructDbusCall(config[op])`. **Reverse (config→proxy co-occurrence provenance)**: every non-`_deferred` dbus op's `method`/`funcName` must appear in some proxy file, **and its `bus`/`path`/`interface` must co-occur with that method/funcName in the same file** (prevents method from proxy A while `bus` is taken from proxy B; or `interface` misusing `bus+".interface"` when the source uses the bare bus name — the latter is a frequent silent failure, now caught). When the app spans multiple proxies, pass **all** `--proxy` args; validation is per-file. A mismatch in either direction → fix the offending entry and re-run. **Remember**: wire_check verifies literal existence + bus/path/interface co-occurrence, but whether the `arg` fields are complete/semantically correct still requires you to check the source field by field (see "Judgment criteria"); do not treat wire_check as sufficient proof the wire is correct. `wire_check` also **informationally reports** proxy methods not wired by any op (surface coverage) — these may be missed capabilities or intentional deferrals/internal methods; you decide.

**Worked example — `feature.read` / `feature.set`** (the proxy is `demo_app/ts/proxy/FeatureProxy.ts`, whose `getFeature` / `setFeature` use `createMethodCallMessage("request")` + `writeString(JSON.stringify({ funcName, data }))` + `readJSON()`):

```json
{
  "feature.read": {
    "type": "dbus",
    "bus": "com.example.featureservice",
    "path": "/com/example/featureservice",
    "method": "request",
    "arg": { "funcName": "featureservice.example.com/modules/getFeature" },
    "reply": "json"
  },
  "feature.set": {
    "type": "dbus",
    "bus": "com.example.featureservice",
    "path": "/com/example/featureservice",
    "method": "request",
    "arg": {
      "funcName": "featureservice.example.com/modules/setFeature",
      "data": { "mode": "${mode}", "fade": "${fade}", "balance": "${balance}" }
    },
    "stringify": ["data"],
    "reply": "json"
  }
}
```

Note how this mirrors the proxy exactly: `method` `"request"` matches `createMethodCallMessage("request")`; `arg.funcName` matches the proxy's `funcName` constant; the `set` op's `data` uses `${mode}`/`${fade}`/`${balance}` placeholders for the call inputs and is listed under `stringify` because the proxy does `JSON.stringify({ ..., data })`. `reply` is `"json"` because the proxy reads via `readJSON()`.

**Worked example — positional multi-write / bare-string / multi-read / device var / interface** (mirrors real YunOS media+music proxies; these are the patterns the engine now supports — wire them, don't defer):

```json
{
  "card_content_read": {
    "type": "dbus",
    "bus": "cn.alios.mafservice.data.music",
    "path": "/cn/alios/mafservice/data/music",
    "interface": "cn.alios.mafservice.data.music",
    "method": "getCardContent",
    "writes": [
      { "kind": "string", "value": "${cpId}" },
      { "kind": "string", "value": "${requestType}" },
      { "kind": "string", "value": "${collectId}" },
      { "kind": "int32", "value": "${pageNo}" },
      { "kind": "int32", "value": "${pageSize}" },
      { "kind": "string", "value": "${sort}" }
    ],
    "reply": "json"
  },
  "default_cp_read": {
    "type": "dbus",
    "bus": "cn.alios.mafservice.data.music",
    "path": "/cn/alios/mafservice/data/music",
    "interface": "cn.alios.mafservice.data.music",
    "method": "getDefaultCp",
    "writes": [ { "kind": "string", "value": "${cpType}" } ],
    "reply": "string",
    "replyParts": [ { "kind": "string" }, { "kind": "int32" } ]
  },
  "sound_library_query": {
    "type": "dbus",
    "bus": "imaudio.alios.cn",
    "path": "/imaudio/alios/cn",
    "method": "querySoundLibrary",
    "arg": { "body": { "pathType": "${pathType}", "vin": "${__device__.vin}", "pageNumber": "${pageNumber}", "pageSize": "${pageSize}" }, "header": { "token": "" } },
    "reply": "json"
  }
}
```

- `card_content_read`: **6 positional writes** (3 string + 2 int32 + 1 string) via `writes[]` — fully wireable, **never defer for "too many writes"**. `interface` is the **bare bus name** (this proxy passes `interface: "<bus>"`, not the default `bus+".interface"`) → set it explicitly, or the engine dials the wrong interface.
- `default_cp_read`: one **bare-string** write (`kind:"string"` — NOT `kind:"json"`, which would corrupt `music` into `"\"music\""`), plus a **2-segment read** (`replyParts`: cpid string + code int32 → returns `[cpid, code]`).
- `sound_library_query`: single JSON write (Pattern A) with `vin` as `${__device__.vin}` (resolved on-car, fail-closed; must be declared in `app.deviceSources`). `interface` **omitted** — this proxy uses the default `bus+".interface"`.

**Worked example — numeric returns → `reply: "int"` / `"double"` (use `int` for `reply`, not `int32`)**

When the proxy reads a single numeric value via `readInt32()` / `readDouble()` (volume, vehicle speed, fuel level), `reply` must be `"int"` / `"double"`:

```json
{
  "get_volume": {
    "type": "dbus",
    "bus": "com.immotors.business_service.IM_AUDIO_SERVICE",
    "path": "/com/immotors/business_service/IImAudioService",
    "interface": "com.immotors.business_service.IImAudioService",
    "method": "getVolume",
    "arg": {},
    "reply": "int"
  },
  "get_fuel_level": {
    "type": "dbus",
    "bus": "com.immotors.business_service.VEHICLE_INFO_SERVICE",
    "path": "/com/immotors/business_service/IVehicleInfoService",
    "interface": "com.immotors.business_service.IVehicleInfoService",
    "method": "getFuelLevel",
    "arg": {},
    "reply": "double"
  }
}
```

`returns.type` of `integer`/`long` → `reply: "int"`; `float`/`double` → `reply: "double"`. **Most error-prone point**: `readInt32()` has "32" in the function name, but the `reply` value is `"int"` (no 32); `"int32"` is only for `writes[].kind`/`replyParts[].kind` — putting it in `reply` is rejected by `validate_config`.

### Step 3: Verify via the gates

The two gates are the verification: both must print success before this step is done. If either fails after 3 fix attempts, stop and surface the errors.

(TypeScript compilation / test runs happen in the pipeline's `test` and `build` steps, not here — this Skill produces only `rpc/config.json`.)

## Quality Checklist

- [ ] **Iron Law satisfied**: every non-`_deferred` op's bus/path/method/funcName/stringify/reply is traceable verbatim to the real proxy/manager source (not guessed, not copied from a fixture) — both gates green ≠ satisfying this item
- [ ] Every capability in `analysis.json` has a matching `op` (= `capability.id`) in `rpc/config.json` — no missing, no extra
- [ ] Each D-Bus `op`'s `bus`/`path`/`method`/`arg`/`stringify`/`reply` is copied from the real proxy source, not guessed
- [ ] `${var}` placeholders match the capability `params` names; `stringify` paths match the proxy's `JSON.stringify` targets
- [ ] `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate_config rpc/config.json --analysis <analysis.json>` passes (schema + coverage + dispatchable)
- [ ] `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" wire_check rpc/config.json --proxy <Proxy.ts>` passes (wire matches the proxy source)
- [ ] The generated server/tool surface remains schema-first: `src/tools/schema.ts` exposes `TOOL_SCHEMA`, `src/server.ts` dispatches tool calls by name, and `src/adapters/index.ts` routes real mode through `rpcCall(op, args)` — do **not** edit generated source in this skill
