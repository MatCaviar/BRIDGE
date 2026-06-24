---
name: mcp-analyze
description: Analyze a YunOS HDT application source code and produce analysis.json for MCP Server generation
---

> 🌐 默认用中文与用户交互和输出（推理、解释、检查点、报告、选项都用中文）；代码、命令、标识符、文件名保持英文。

> 本 skill 的 base dir = 加载时显示的路径；CLI 调用形式为 `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" <subcmd> ...`（${SKILL_DIR} 即本 skill 的 base dir）。若 `${SKILL_DIR}` 未展开，改用 `${CLAUDE_PLUGIN_ROOT}/cli/bin/mcp-pipeline.js`（CLAUDE_PLUGIN_ROOT 即插件根目录，CLI 在 `<根>/cli/bin`，勿加 `../../`）。

# MCP Analyze

Analyze the specified YunOS HDT application and produce a structured `analysis.json` that captures its interface surface — capabilities, parameters, returns, safety levels, and error codes.

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

> **Ground rule — derive from source only.** Analyze the app's OWN source. Never read or rely on `schema/__tests__/fixtures/*` — those are stale CLI test fixtures, not authoritative for this app; using them makes the analysis stale and non-generalizable. Every capability must come from the live source via `sourceRef`.

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
    "dualScreen": false
  },
  "capabilities": [
    {
      "id": "snake_case_tool_id",
      "domain": "string",
      "object": "string — target object",
      "action": "string — verb phrase",
      "params": [{ "name": "string", "type": "string", "optional": false }],
      "returns": { "type": "string", "fields": ["string"] },
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
- [ ] Safety levels are correctly assigned based on the action's risk profile
- [ ] All enum types referenced in params are in the enums section
- [ ] Error codes have unique full codes (prefix * 1000 + suffix)
- [ ] The output passes `node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" validate` with zero errors
- [ ] `framework` is always `"YunOS HDT"`
- [ ] No internal implementation details — only interface surface
