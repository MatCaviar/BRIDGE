---
name: mcp-analyze
description: Use when given a YunOS HDT app directory and analysis.json (its interface surface — capabilities, params, returns, safety levels, error codes) must be produced, before scaffold/generate. This is the input every later step depends on.
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> CLI：`node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`（`${SKILL_DIR}` 未展开时改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`）。

# MCP Analyze

Analyze the specified YunOS HDT application and produce a structured `analysis.json` that captures its interface surface — capabilities, parameters, returns, safety levels, and error codes.

## 判断标准

`analysis.json` 是后续所有步骤的唯一输入：scaffold 用它生成项目骨架，generate 用每个 capability 的 `sourceRef` 去源码抽真实 wire。**漏一个 capability = 最终 server 漏一个 tool；写错一个 sourceRef = generate 找不到 wire、被迫 defer。** `validate` 只查 schema 格式——它不查你漏没漏 capability、sourceRef 精不精确、safetyLevel 合不合理。这些是你的判断。

逐条自检一份好的 analysis：
- **完整**：app 里每个调用 YunOS SDK（`@system.*`/`@yunos.*`）且对外可触发的函数，都捕成一个 capability（漏了 = 用户少一个 tool）。
- **可追溯**：每个 capability 的 `sourceRef` 精确到 `file:method`——模糊 sourceRef 是 generate 臆造/defer 的源头。
- **准确**：params/returns 的 type 来自源码类型标注（不是"大概 string"）；`safetyLevel` 按**行为风险**定（只读无副作用→`readonly`；驾驶中安全的状态改变→`normal`；需 P 档→`p_gear_required`；+用户确认→`p_gear_and_confirm`；+网络热点→`p_gear_and_network`；拿不准取**更严**一档）。
- **enum 是 wire 值**：`param.enum` 必须是**上游 agent 直接传的真实 wire 值**（从源码逐字抽取），不是展示名——schema_preview 把它们原样进 `inputSchema.enum`。档位传 `["P","R","N","D"]`（真值）而非 `["PARK","REVERSE"]`（展示名）；声场模式传 wire 数值（`["0","1",...]`）而非中文名（`["全车均衡",...]`）。传展示名 = 上游 agent 按 schema 调用错值。
- **interface-level only**：只描述对外接口表面，不写内部实现。

**借口预驳**：「这函数扫过了大概 read 类」→ 必须读源码确认 action/object；「safetyLevel 按函数名猜」→ 按行为副作用，拿不准取更严；「sourceRef 写文件名就行」→ generate 靠它定位 wire，必须精确到方法；「enum 用展示名就行」→ enum 必须是 wire 真实值，上游 agent 传它去 wire，传展示名 = 调用错；「这些 enum 没人用省了」→ 凡 params/returns 引用的 enum 都要抽。

## Input

The user provides the path to a YunOS HDT application directory. Example: `/mcp-analyze ./aipet`

## Process

### Step 1: Scan Application Structure

Read these files to understand the app:

1. **Manifest**: Look for `manifest.json`, `app.json`, or similar config at the root. Extract: app name, pages, permissions, framework version.
2. **Entry file**: Find the main TypeScript/JavaScript entry point. Usually `src/index.ts` or `src/app.ts`.
3. **Service files**: Look in `src/services/`, `src/api/`, or equivalent for SDK interaction code.
4. **Type definitions**: Look in `src/types/`, `src/models/`, or inline types for enums and interfaces.

### Step 2: Identify Capabilities

For each callable function in the service layer that interacts with YunOS SDKs:

1. **Assign a tool ID**: snake_case verb phrase matching the action, e.g. `navigate_to`, `read_gear_status`, `capture_pet`.
2. **Extract parameters**: Name, TypeScript type, whether optional. If the parameter accepts enum values, reference the enum.
3. **Extract return type**: Type name and field names from the function's return type annotation.
4. **Determine safety level**:
   - `readonly` — reads data without side effects (e.g. `read_gear_status`, `get_current_page`)
   - `normal` — state change safe while driving (e.g. `navigate_to`, `show_toast`)
   - `p_gear_required` — requires P-gear (e.g. `capture_pet`, `take_photo`)
   - `p_gear_and_confirm` — requires P-gear + user confirmation (e.g. `factory_reset`, `delete_data`)
   - `p_gear_and_network` — requires P-gear + active WiFi hotspot (e.g. `share_wifi_qr`, `start_hotspot`)
5. **Extract SDK calls**: Identify `@system.*` or `@yunos.*` module imports used by the function.
6. **Record source reference**: `file:relative_method` format.
7. **Author descriptions**: For each capability and parameter, write a dense `description` that an upstream agent can act on WITHOUT reading the source. Extract everything from the app code:
   - **capability.description** — what it does + the target object; for each parameter its semantics, type, and **value range** (e.g. `0–40`, `0–100`); when a parameter is an enum, list the **`value=meaning`** pairs by reading the enum's member→value mapping from the source (e.g. `ts/interface/*.ts`); any cross-tool precondition (e.g. "enable the master toggle first") and unsupported cases or units.
   - **param.description** — a short per-parameter hint (range / enum meanings / units).
   These are surfaced **verbatim** to upstream agents; if omitted, the scaffold only emits a heuristic fallback — so write them fully.
8. **Device-injected values are NOT agent params**: if the proxy injects device state the agent can't know (VIN from `CarInfoModel`, auth token, system zone id) into the wire, do **not** list it as a `param` (the agent can't supply it). Record its source name (e.g. `"vin"`) in `app.deviceSources` (see Output); `/mcp-generate` templates it as `${__device__.vin}`, resolved on-car (fail-closed). Only values the upstream agent genuinely supplies are `params`.
9. **Don't pre-judge wire feasibility**: positional multi-write (`writeString`/`writeInt32` × N), bare-string write, and multi-segment read are **all wireable** by the engine. Capture every SDK-calling capability normally — `/mcp-generate` picks the wire pattern (`writes`/`replyParts`). Never mark a capability "partial"/skip just because it uses many writes or non-JSON writes; that silently loses real capabilities.
10. **Declare `safetyProbes` for `p_gear_*` tools** (else they fail-closed): the safety guard NO LONGER guesses the gear/hotspot probe by keyword — it reads `app.safetyProbes` (`{ gear?: "<capId>", hotspot?: "<capId>" }`). If the app has `p_gear_required`/`p_gear_and_confirm` tools, find the capability that reads gear status (returns `{ isParked, ignoreMode }`) and set `safetyProbes.gear` to its id; for `p_gear_and_network`, set `safetyProbes.hotspot` to the wifi/hotspot-info capability id. **An undeclared probe ⇒ those tools fail-closed (rejected, never silently passed)** — so a missing probe is a reliability hole, not a safe default. If the app defines custom preconditions or overrides a standard level, declare `app.safetyRules` (`{ "<level>": { requiresGear?, requiresHotspot?, requiresConfirm?, description? } }`); otherwise omit (built-in 5 levels apply).
11. **Declare object/array shapes**: when a param or return field is an **object** or **array**, capture its inner shape so the projector emits STRUCTURED JSON-Schema — otherwise it collapses to an opaque object and a weaker agent must guess the fields/keys to construct.
    - **Object param** (`type` names a model, e.g. `HvacMode`, `NavOptions`): add `properties: [{name,type,...}]` (each sub-field is itself param-shaped — `enum`/`optional`/`minimum`/`maximum`/`defaultValue`/`examples` all project). Mark required fields implicitly (omit `optional`) or explicitly via the parent's `required`. Example: `{name:"mode", type:"HvacMode", properties:[{name:"fanSpeed",type:"number",minimum:0,maximum:10},{name:"zone",type:"string",enum:["front","rear"],optional:true}]}`.
    - **Array param** (`type` ends `[]` or is `Array<T>`, e.g. `ResourceCode[]`): add `items` (a nameless **FieldShape** — `{type, enum?, properties?, items?, ...}`) describing ONE element. For a scalar array, `items:{type:"string"}` suffices; for an array of objects, give `items` a `properties` array. Example: `{name:"resources", type:"ResourceCode[]", items:{type:"object", properties:[{name:"resourceCode",type:"string"}]}}`. Without `items`, the array still validates but its elements are opaque to the agent — only omit `items` when the element shape is genuinely unknown.
    - **Return fields → chaining**: bare field names (`["success"]`) are fine for unknown shapes, but for structured/array returns use a **TypedField** (`{name,type,items?,properties?,required?}`) so the projector emits an `outputSchema`. **This is what lets a downstream agent chain tools** — e.g. declare `query_sound_library`'s return as `{name:"entries",type:"SoundEntry[]",items:{type:"object",properties:[{name:"resourceCode",type:"string"}]}}` and the agent can read `entries[].resourceCode` from the schema alone to feed `install_sound_library`. Same rules as params for `items`/`properties` (recursive — nest as deep as the source type does).
    - **Don't fabricate shapes you can't trace**: only declare `properties`/`items` fields you read from the source type annotation. If a return field's shape is genuinely opaque (untyped payload, arbitrary JSON), leave it as a bare name — never invent fields.

### Step 3: Extract Enums

For each TypeScript enum found in type definitions:
- Record the enum name, member values, underlying type (string/number), and source file.
- Only extract enums referenced by capability params or returns.

### Step 4: Derive Error Codes

If the app defines error codes or error handling constants:
- Group by domain (e.g. navigation errors → prefix 2, pet errors → prefix 3).
- Record each code's suffix value and zh-CN message.
- If no explicit error codes exist, infer domain groupings from capabilities and assign sequential prefixes starting from 1.

### Step 5: Validate Output

After writing the analysis.json file, run:

```bash
node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate .mcp-pipeline/<app-name>/analysis.json
```

If validation fails, fix the analysis.json and re-validate until it passes.

## Output

Write the result to `.mcp-pipeline/<app-name>/analysis.json` relative to the app directory.

The output must conform to this structure (validated by `analysis.schema.json`):

```json
{
  "app": {
    "name": "string — kebab-case app identifier",
    "domain": "string — YunOS domain",
    "framework": "YunOS HDT",
    "entryFile": "string — relative path to entry TS file",
    "pages": ["string"],
    "permissions": ["string"],
    "voiceEnabled": false,
    "dualScreen": false,
    "deviceSources": ["vin — device-resolved var names; /mcp-generate templates them as ${__device__.X}. Omit if the app injects no device context into the wire."],
    "safetyProbes": { "gear": "read_gear_status — cap id returning {isParked,ignoreMode}; set when app has p_gear_* tools, else those fail-closed" },
    "safetyRules": { "custom_level": { "requiresGear": true, "requiresConfirm": true, "description": "..." } }
  },
  "capabilities": [
    {
      "id": "snake_case_tool_id",
      "domain": "string",
      "object": "string — target object",
      "action": "string — verb phrase",
      "params": [
        { "name": "string", "type": "string", "optional": false, "enum": ["wireValue — real on-the-wire value, NOT display name"], "description": "per-param hint (range/enum meanings/units)", "minimum": 0, "maximum": 100, "defaultValue": 0, "examples": ["example wire value"] },
        { "name": "objectParam", "type": "ModelName", "properties": [{ "name": "field", "type": "string", "enum": ["wireValue"], "optional": false }] },
        { "name": "arrayParam", "type": "Element[]", "items": { "type": "object", "properties": [{ "name": "id", "type": "string" }] } }
      ],
      "returns": {
        "type": "ResultModel",
        "fields": [
          "bareName — type unknown",
          { "name": "typedField", "type": "string", "description": "..." },
          { "name": "arrayField", "type": "Element[]", "items": { "type": "object", "properties": [{ "name": "id", "type": "string" }] } }
        ]
      },
      "safetyLevel": "readonly|normal|p_gear_required|p_gear_and_confirm|p_gear_and_network",
      "sdkCalls": ["@system.module"],
      "sourceRef": "file:method"
    }
  ],
  "enums": {
    "EnumName": { "values": ["member1"], "type": "string|number", "sourceFile": "path" }
  },
  "errorCodes": {
    "prefix_key": {
      "prefix": 1,
      "domainName": "string",
      "codes": { "CODE_NAME": { "value": 1, "message": "zh-CN message" } }
    }
  }
}
```

## Quality Checklist

Before completing, verify:

- [ ] Every exported function that calls a YunOS SDK is captured as a capability
- [ ] Tool IDs are unique and follow snake_case convention
- [ ] Every capability has a dense `description` + per-param `description` authored from source (what + params + ranges + enum value=meaning mappings)
- [ ] Safety levels are correctly assigned based on the action's risk profile
- [ ] All enum types referenced in params are in the enums section
- [ ] Object/array params declare their inner shape (`properties` / `items`) — never collapse to an opaque object unless the shape is genuinely untraceable
- [ ] Structured/array returns use TypedField (`{name,type,items?,properties?}`) so tools chain via `outputSchema`
- [ ] Error codes have unique full codes (prefix * 1000 + suffix)
- [ ] The output passes `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate` with zero errors
- [ ] `framework` is always `"YunOS HDT"`
- [ ] No internal implementation details — only interface surface
