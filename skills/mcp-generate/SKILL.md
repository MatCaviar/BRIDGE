---
name: mcp-generate
description: Use when the scaffolded MCP Server project exists and rpc/config.json (the op→wire map) must be authored from the app's proxy/manager source — the sole LLM-judgment step before the gates and build. Not for scaffolding (deterministic) or analyzing (separate skill).
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> CLI：`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`（`${SKILL_DIR}` 未展开时改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`）。

# MCP Generate

Read the scaffolded MCP Server project and the original YunOS app source code, then produce the ONE file that only a host codeagent can produce: `rpc/config.json` — the op→wire-spec map that wires each capability to its real D-Bus / native call, so the generated MCP server can dispatch tool calls through the RPC bridge instead of pretending a mock is the final integration.

## Iron Law

```
NO INVENTED WIRE
```

`rpc/config.json` 里每一个非 `_deferred` 的 op，其 `bus`/`path`/`method`/`interface`/`arg.funcName`/`arg.data`/`writes`/`stringify`/`reply`/`replyParts` 都必须**逐字**可追溯到 app proxy/manager 源码里的真实调用点。找不到真实依据 → 写进 `_deferred` 并注明原因。没有例外。

**违反字面就是违反精神**——没有"我 adapt 了一下但守了精神"这种事。按命名规律推 `bus` 名、给 `funcName` 填"符合格式"的字符串、因 `validate_config` 过了就默认 wire 对、从旧 config/fixture 抄找不到源码依据的 entry，都是臆造，都是违规。

**为什么**：你抽的 wire 会让生成的 MCP server 在**真车上真的发出这条 D-Bus/native 调用**。臆造的 `funcName`/`bus` 不报错——只会静默地控制错误的东西。这是整条链的安全命门；"config 能过 gate" ≠ "wire 真实"。

## 借口预驳

| 你心里的话 | 现实 |
|---|---|
| "validate_config 过了，wire 应该对" | validate_config 只查 schema + coverage + dispatchable，**完全不读源码**，对 wire 真伪零判断 |
| "wire_check 会兜底，过了就行" | wire_check 校验你**传入的** proxy + funcName 字面存在；它不读 bus/path 语义，也不是"wire 正确"的充分证明 |
| "proxy 里没找到，但 fixture / 旧 config 有这个 bus 名" | fixture 不是 ground truth，proxy 源码才是。找不到 → `_deferred`，不抄 fixture |
| "这个 funcName 符合命名规律，应该对" | funcName 是精确接口路径，必须逐字来自源码，"符合规律" ≠ 存在 |
| "sourceRef 指的文件没这方法，可能重构了" | 去 app 源码 grep 真实 proxy/manager（按 object/action、bus 名、`createMethodCallMessage` 调用点）。仍找不到 → `_deferred` + 原因 |
| "先发一版，后面再核对" | 臆造 wire 上车 = 静默错配。没有"先发的臆造版"，只有 verified 或 deferred |

## 判断标准（何为 verified wire）

一条 op 算 **verified**，当且仅当你能对**每个字段**指出"这逐字来自源码哪里"：
- `bus`/`path` ← proxy 构造函数 / `BUS_NAME`/`BUS_PATH` 常量
- `method` ← `createMethodCallMessage("<这个>")` 的字面参数
- `arg.funcName` ← 源码 `writeString` 对象里 `funcName:` 的字面值
- `arg.data` 的 `${var}` ← 与 capability `params` 名字一一对应（单占位符、类型保留）
- `stringify` ← 与源码 `JSON.stringify(...)` 目标路径一致
- `reply` ← `readJSON()`→`json` / `readString()`→`string` / 类型读 → `int`/`double`/`bool`（值用 `int`，**非 `int32`**；`int32` 只用于 `writes[].kind`/`replyParts[].kind`，放进 `reply` 会被 `validate_config` 拒绝）

任一字段无法指出源码位置 → 这条不是 verified：要么继续 grep 找，要么进 `_deferred`。**两个 gate 全绿 ≠ 这些字段对**——gate 只查下限。

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
     - `reply` — `readJSON()`→`"json"` / `readString()`→`"string"` / `readInt32()`→`"int"` / `readDouble()`→`"double"` / `readBool()`→`"bool"`. **`reply` 只能取 `json`/`string`/`int`/`double`/`bool` 这 5 个值**。易错点：`readInt32()` 的函数名带 "32"，但映射出的 `reply` 值是 **`"int"`（不带 32）**；`"int32"` 只能出现在 `writes[].kind`/`replyParts[].kind`，**放进 `reply` 会被 `validate_config` 拒绝**（`dbus.reply must be one of json,string,int,double,bool`）。按 `returns.type` 选：`integer`/`long`→`"int"`，`float`/`double`→`"double"`，`boolean`→`"bool"`，`string`→`"string"`，`object`/结构体→`"json"`。
   - **Pattern B — positional multi-write:** proxy does several `writeString(...)` / `writeInt32(...)` in order (NOT one `writeString(JSON.stringify(...))`). Use **`writes`** (an ordered array) instead of `arg`. Each item `{ kind, value }`: `kind` = `"string"`|`"int32"`|`"double"`|`"bool"`|`"json"`; `value` = literal or `${var}`. `kind:"json"` ⇒ `writeString(JSON.stringify(value))`; `kind:"string"` ⇒ bare `writeString(value)` (no JSON quotes). This is how you wire capabilities the old engine had to defer — **6 positional writes is fine, not "partial"**.
   - **Pattern C — bare-string write:** proxy does a single `writeString(cpType)` with a raw string (not JSON). Use `writes: [ { kind: "string", value: "${cpType}" } ]` — `kind:"string"` writes the value bare; `kind:"json"` would wrongly wrap it in quotes and corrupt the value.
   - **Pattern D — multi-segment read:** proxy reads several values (`readString()` then `readInt32()`, etc.). Use **`replyParts`** (ordered array of `{ kind }`); the engine returns an array of the segments in order. Omit `replyParts` for the common single-read case (then `reply` drives one read).
   - **Device-context vars:** if the proxy injects device state (VIN from `CarInfoModel`, auth token, etc.) into the wire — i.e. a value the agent cannot know and the generic engine cannot read — template it as **`${__device__.vin}`** and ensure `analysis.app.deviceSources` lists `"vin"`. The car-side engine resolves `__device__.*` on-device and **fail-closes** (throws, never leaks the marker) if unresolved. Do NOT make device-injected values into agent `params` (the agent can't supply them) and do NOT hardcode a fake — use `${__device__.X}`.
   - **Native** (`require`/factory + method): extract `require`, optional `factory`, `method`, and the literal `args` array (each item a `${var}` or `{ expr: "arithmetic" }`).
3. **Write the entry** into `rpc/config.json` with `op` = `capability.id` (the key under which the spec is stored).

**sourceRef 对不上真实源码时的处理（绝不臆造 wire）**：
1. 若 sourceRef 指向的方法在真实源码里不存在或方法名不符，**不要按 fixture 臆造 wire**——在 app 源码里搜索该 capability 真正的 proxy/manager（按 capability 的 object/action 关键词、D-Bus bus 名、`createMethodCallMessage` 调用点grep）。
2. 找到真实 proxy → 按其 `createMethodCallMessage`+`funcName`+`stringify` 模式抽真实 wire-spec，写入 config（verified）。
3. **先排除"可 wire 却误判为 defer"**（最常见的能力丢失）：位置式多写（`writeString`/`writeInt32` × N）、裸字符串写、多段读 **都是 dbus RPC**（见上 Pattern B/C/D），**必须用 `writes`/`replyParts` wire，不得 defer**。"参数多/写多段" 不是 defer 理由——引擎支持任意段。只有**真不走 dbus/native RPC**（如 `launch_app`=adb sendlink、`appstatus`=进程内读取、纯 UI 页面跳转）才 defer：在 `rpc/config.json` 顶层写入 `_deferred` 允许清单——`"_deferred": { "<cap.id>": "<原因>" }`（例 `"_deferred": { "launch_app": "adb sendlink — 非 RPC" }`）。**不要给它写 wire-spec**；`_deferred` 里登记即代表有意不提供 wire。`validate_config` 的 coverage 闸门会豁免 `_deferred` 登记的 capability，并把它们作为 `deferred` 信息型字段返回。
4. 报告里清晰区分每条 capability：`verified`（源码核对过 wire）vs `deferred`（写入 `_deferred`+原因）。**禁止把 inferred/猜测的 wire 当 verified 发出。**
5. `validate_config` 会要求每个进 config 的 capability 都 dispatchable；deferred 的只进 `_deferred`（不进 wire-spec）——覆盖率闸门对它们放行（它们不在 RPC 模型内，机器可读地登记在 `_deferred` 里）。

4. **Run both gates** (these are deterministic CLI gates — the reliability spine). On failure, read the gate's error message, fix the config, and re-run. Retry up to 3 attempts; if still failing, surface the gate errors to the user and stop.

   ```bash
   node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate_config rpc/config.json --analysis <analysis.json>
   node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" wire_check rpc/config.json --proxy <path/to/Proxy.ts>
   ```

   - `validate_config` checks: schema conformance (RpcConfig), **coverage** (every capability has a matching `op`), and **dispatchable** (`constructDbusCall`/`constructNativeCall` runs against sample args synthesized from `cap.params` without crashing, `${var}` interpolation and `stringify` correct).
   - `wire_check` 现在双向校验。**正向（proxy→config）**：解析 proxy 的 `createMethodCallMessage("m") ... funcName: "f"` 模式，重建期望 wire，与 `constructDbusCall(config[op])` 比较。**反向（config→proxy 共现溯源）**：每个非 `_deferred` dbus op 的 `method`/`funcName` 必须出现在某个 proxy 文件里，**且其 `bus`/`path`/`interface` 必须与该 method/funcName 同文件共现**（防止 method 在 proxy A、bus 却取自 proxy B；或 interface 误用 `bus+".interface"` 而源码用的是裸 bus 名——后者是高频静默失败，现已能被拦）。app 跨多 proxy 时传**全部** `--proxy`，按文件粒度校验。任一方向 mismatch → 修对应 entry 重跑。**仍要记住**：wire_check 校验字面存在 + bus/path/interface 共现，但 `arg` 字段是否齐全/语义正确仍需你逐字段核对源码（见「判断标准」），别把 wire_check 当成 wire 正确的充分证明。`wire_check` 还会**信息性报告**未被任何 op 接线的 proxy method（surface coverage）——可能是遗漏的 capability，也可能是有意 defer/internal，需你判断。

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

**Worked example — 数值返回 → `reply: "int"` / `"double"`（reply 用 `int`，不是 `int32`）**

proxy 用 `readInt32()` / `readDouble()` 读单个数值（音量、车速、油量）时，`reply` 必须是 `"int"` / `"double"`：

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

`returns.type` 为 `integer`/`long` → `reply: "int"`；`float`/`double` → `reply: "double"`。**最易错点**：`readInt32()` 函数名带 "32"，但 `reply` 值是 `"int"`（不带 32）；`"int32"` 仅用于 `writes[].kind`/`replyParts[].kind`，放进 `reply` 会被 `validate_config` 拒绝。

### Step 3: Verify via the gates

The two gates are the verification: both must print success before this step is done. If either fails after 3 fix attempts, stop and surface the errors.

(TypeScript compilation / test runs happen in the pipeline's `test` and `build` steps, not here — this Skill produces only `rpc/config.json`.)

## Quality Checklist

- [ ] **Iron Law 满足**：每个非 `_deferred` op 的 bus/path/method/funcName/stringify/reply 都逐字可追溯到真实 proxy/manager 源码（不是 guessed、不是抄 fixture）——两个 gate 全绿 ≠ 满足此条
- [ ] Every capability in `analysis.json` has a matching `op` (= `capability.id`) in `rpc/config.json` — no missing, no extra
- [ ] Each D-Bus `op`'s `bus`/`path`/`method`/`arg`/`stringify`/`reply` is copied from the real proxy source, not guessed
- [ ] `${var}` placeholders match the capability `params` names; `stringify` paths match the proxy's `JSON.stringify` targets
- [ ] `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate_config rpc/config.json --analysis <analysis.json>` passes (schema + coverage + dispatchable)
- [ ] `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" wire_check rpc/config.json --proxy <Proxy.ts>` passes (wire matches the proxy source)
- [ ] The generated server/tool surface remains schema-first: `src/tools/schema.ts` exposes `TOOL_SCHEMA`, `src/server.ts` dispatches tool calls by name, and `src/adapters/index.ts` routes real mode through `rpcCall(op, args)` — do **not** edit generated source in this skill
