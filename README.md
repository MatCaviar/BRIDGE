<div align="center">

# 🎛️ CodeAgent @ MCP

<img src="assets/bridge.svg" alt="BRIDGE" height="76">

**B**uilding **R**eal-device **I**nterfaces via **D**eterministic **G**ated **E**xecution

`analyze` › `curate` › `scaffold` › `generate` › `gates` › `build`

![version](https://img.shields.io/badge/version-0.1.7-0066cc)
![license](https://img.shields.io/badge/license-MIT-22c55e)
![dual-end](https://img.shields.io/badge/ends-Claude%20Code%20%7C%20Codex-7c3aed)
![no-llm](https://img.shields.io/badge/plugin-no%20LLM%20inside-6b7280)
![platform](https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-339933)

</div>

---

A Claude Code / Codex plugin — **BRIDGE** (*Building Real-device Interfaces via Deterministic Gated Execution*): agent-driven **skills** carry the methodology, a **deterministic** Node CLI does the heavy lifting, and the host agent drives every step. **No model calls live inside the plugin** — the host agent supplies all judgment, and every generated artifact is byte-for-byte reproducible.

Given an app's source + manifest, it emits a ready-to-run MCP Server that an upstream agent can call to **actually drive the device** — EQ, soundstage, Beosonic, karaoke, vehicle signals, … — not a throw-stub mock.

## 🧠 How it works

Three views of one system. **Offline**, the host agent builds a verified server from an app. **Online**, that server drives the real device over a file mailbox — no network. A concrete capability (`soundstage_read`) is threaded through to keep it specific.

**Fig. 1 — End-to-end pipeline.** The agent extracts capabilities; the CLI deterministically generates the server; the agent extracts per-op wire specs (the one judgment step, screened by two fail-closed gates); at runtime a file-mailbox RPC actuates the device and a reply descriptor unwraps the answer.

```mermaid
flowchart TD
    classDef agent fill:#eef2ff,stroke:#4338ca,stroke-width:1.5px,color:#1e1b4b
    classDef det fill:#ffffff,stroke:#475569,stroke-width:1.4px,color:#0f172a
    classDef gate fill:#fff7ed,stroke:#b45309,stroke-width:1.7px,color:#7c2d12
    classDef rt fill:#ecfeff,stroke:#0e7490,stroke-width:1.4px,color:#155e75
    classDef art fill:#f8fafc,stroke:#94a3b8,stroke-width:1.2px,color:#334155
    classDef key fill:#3730a3,stroke:#1e1b4b,stroke-width:2px,color:#ffffff

    SRC["app source + manifest<br/>e.g. AudioPolicyProxy.getSoundStage()"]:::art

    subgraph OFF ["Offline — build the server"]
      direction TB
      EXT["analyze · agent — extract capabilities<br/>e.g. soundstage_read: params ∅ · returns {mode,fade,balance}<br/>safety: readonly · errors AUDIO (2xxx)"]:::agent
      SEL["curate · agent — pick subset (optional)"]:::agent
      SYN["scaffold · CLI — generate server code<br/>rpc-bridge · adapter rpcCall→DTO · tools (Zod + safety guard)<br/>registry · car-side RpcEngine · zero app literals"]:::det
      BIND["generate · agent — extract per-op wire specs<br/>e.g. soundstage_read → bus com.yunos.audiopolicyservice · method request<br/>reply {read: json, unwrap: result.data}"]:::key
      G1{{"gate · validity<br/>schema · coverage · dispatchable"}}:::gate
      G2{{"gate · equivalence<br/>proxy ↔ wire spec"}}:::gate
      EXT --> SEL --> SYN --> BIND --> G1 --> G2
    end

    SRC --> EXT
    G2 -->|"verified"| TS["MCP tool surface<br/>one tool per capability · safety-annotated"]:::art

    subgraph ON ["Online — drive the device (no network)"]
      direction LR
      CALL["host agent calls tool<br/>soundstage_read"]:::agent
      ADP["adapter · rpcCall"]:::rt
      MAIL["file mailbox<br/>/sdcard/imrpc/cmd + result"]:::art
      ENG["car RpcEngine<br/>constructDbusCall → D-Bus"]:::rt
      DEV["YunOS device<br/>returns {result:{data:{mode,fade,balance}}}"]:::art
      NORM["applyReply · unwrap result.data<br/>→ DTO {mode,fade,balance}"]:::key
      CALL --> ADP
      ADP -->|"write {reqId,op,args}"| MAIL
      ADP -.->|"sendlink spawn"| ENG
      ENG <-->|"D-Bus"| DEV
      ENG -.->|"write {reqId,ok,data}"| MAIL
      MAIL -->|"poll · reqId match"| NORM
    end

    TS --> CALL
```

**Fig. 2 — Return-shape extraction (the key design).** The device answers reads in three different shapes. A tiny 4-field descriptor (`read / unwrap / parseJson / valueField`) lives in each wire spec and tells the adapter exactly how to reach the payload — so generated servers extract the right fields instead of reading blindly off the top level.

```mermaid
flowchart LR
    classDef dev fill:#f1f5f9,stroke:#64748b,stroke-width:1.3px,color:#334155
    classDef d fill:#eef2ff,stroke:#4338ca,stroke-width:1.5px,color:#1e1b4b
    classDef dto fill:#ecfdf5,stroke:#059669,stroke-width:1.5px,color:#064e3b

    subgraph C1 ["case 1 · object reply → unwrap"]
      direction TB
      D1["device readJSON()<br/>{ result: { data: {mode, fade, balance} } }"]:::dev
      X1["descriptor<br/>{read: json<br/>unwrap: result.data}"]:::d
      O1["DTO {mode, fade, balance}"]:::dto
      D1 --> X1 --> O1
    end
    subgraph C2 ["case 2 · scalar reply → valueField"]
      direction TB
      D2["device readDouble()<br/>returns 0"]:::dev
      X2["descriptor<br/>{read: double<br/>valueField: success}"]:::d
      O2["DTO {success: true}<br/>(0 = success)"]:::dto
      D2 --> X2 --> O2
    end
    subgraph C3 ["case 3 · string reply → parseJson"]
      direction TB
      D3["device readString()<br/>a JSON-encoded string"]:::dev
      X3["descriptor<br/>{read: string<br/>parseJson: true}"]:::d
      O3["DTO {parsed object}"]:::dto
      D3 --> X3 --> O3
    end
```

**Fig. 3 — Real-device round-trip.** The host writes a command file, wakes the car page with `sendlink`, and polls the result file by `reqId`. One shared mailbox ⇒ calls are serialized; a device failure propagates as a domain error code.

```mermaid
sequenceDiagram
    autonumber
    actor Agent as host agent
    participant Server as MCP server (adapter)
    participant Mailbox as mailbox /sdcard/imrpc
    participant Engine as car RpcEngine
    participant Device as YunOS device

    Agent->>Server: call tool soundstage_read
    Server->>Mailbox: write cmd {reqId, op, args}
    Server->>Engine: sendlink page://app.yunos.com/rpcagent
    Note over Engine: spawned page reads cmd · looks up wire spec
    Engine->>Device: constructDbusCall → D-Bus request
    Device-->>Engine: readJSON() {result:{data:{...}}}
    Engine->>Mailbox: write result {reqId, ok, data}
    Server->>Mailbox: poll result (reqId match)
    Mailbox-->>Server: {reqId, ok, data}
    alt ok
        Server->>Server: applyReply(descriptor) → DTO
        Server-->>Agent: {success, mode, fade, balance}
    else not ok
        Server-->>Agent: error (device code → domain code)
    end
    Note over Server: serialized — one shared mailbox, calls run in sequence
```

## 🛡️ Why it's reliable

| Guarantee | How it's enforced |
|---|---|
| **Deterministic output** | Generators carry zero app literals — any app, any machine, byte-for-byte reproducible. |
| **Verified before build** | Two fail-closed gates — `validate-config` (schema + coverage + dispatchable) and `wire-check` (proxy wire-format match) — must pass on the host's only judgment product, `rpc/config.json`. |
| **Fail-closed safety** | `p_gear_required` tools are blocked unless Park is verified; degenerate input (empty / unmatched) errors instead of passing vacuously. |
| **Honest selection** | `--selection` with a missing file, unknown ids, or an empty list **errors loudly** rather than silently over- or under-generating. |
| **Real bridge, no network** | A car-side RPC engine (delivered to a colleague) bridges host → device over adb / file / sendlink. |
| **Self-contained** | CLI runs via a skill-base-relative path; `framework/` + `cli/` deps auto-install and build on first session. |

## 🧭 Pipeline

```
validate › analyze › [curate] › scaffold › generate › test › build › register › verify 🟢
  (CLI)     (skill)   (skill)    (CLI)    (skill+gates) (CLI)  (CLI)   (CLI)     (CLI)
```

Each step is either a **deterministic CLI** subcommand or an **agent skill**. Progress persists in `.mcp-pipeline/<app>/state.json` for resume — `--from`, `--only`, `--step`, `--batch`.

> The two gates (`validate-config` + `wire-check`) are inline sub-steps of `generate`, retried until both pass before the pipeline advances. `[curate]` is optional.

## 🧩 Capability selection

Most apps expose far more capabilities than you want to MCP-ify. After `analyze`, **curate** lets you choose the subset — the user's pick is the first priority.

```bash
# 1. Enumerate candidates deterministically (writes nothing)
mcp-pipeline curate <analysis.json> [--prd <prd.md>]

# 2. /mcp-curate proposes a subset, you choose → writes selection.json
# 3. Scaffold generates only the chosen capabilities
mcp-pipeline scaffold <analysis.json> --output <dir> --selection .mcp-pipeline/<app>/selection.json
```

`selection.json = { "selected": ["<cap.id>", …] }`. Re-pick any time — the generate-layer regenerates, while `conf/config.yaml` and `rpc/config.json` are preserved.

## 📥 Install

**Claude Code**

```bash
/plugin marketplace add https://github.com/MatCaviar/im-mcp-codeagent.git
/plugin install im-mcp-codeagent
```

First session start auto-installs `framework/` + `cli/` and builds `cli/dist` (idempotent). Then:

```
/mcp-pipeline ./path/to/your-app
```

Entry points — `/mcp-pipeline` · `/mcp-verify <dir>` · `/mcp-help`.

**Codex** reads the mirrored `.codex-plugin/plugin.json` (dual-end).

## 🔄 Update (already installed)

When a new version ships, refresh and reload:

```text
/plugin marketplace update im-mcp-marketplace        # 1. refresh the catalog   (arg = marketplace name)
/plugin update im-mcp-codeagent@im-mcp-marketplace   # 2. pull the new version  (arg = plugin@marketplace)
/reload-plugins                                      # 3. activate it + re-run the build hook
```

> `/reload-plugins` (or a full `/exit` + relaunch) is **required** — until then the previous version stays live. The first session after reload re-runs the `SessionStart` build hook, which compiles `cli/dist` for the new version.

Verify the installed version:

```text
/plugin list
```

**Fallback** — if `/plugin update` reports "already latest" but the code didn't change (stale cache, or the version wasn't bumped):

```text
/plugin uninstall im-mcp-codeagent@im-mcp-marketplace
/plugin marketplace update im-mcp-marketplace
/plugin install im-mcp-codeagent@im-mcp-marketplace
/reload-plugins
```

## 📡 Real-device prerequisites

The generated server drives the car over an adb / file bridge. Before a real device responds:

1. **Colleague** builds + installs the car-side `RpcEngine.ts` and registers the `page://<app>.yunos.com/rpcagent` manifest page — both emitted under `car-side/`.
2. **`adb -host`** reachability to the YunOS device.
3. **ZebraAlfred** keep-alive (or equivalent) — otherwise the device sleeps and sendlink intermittently returns exit `-1`.

No device handy? Local verification always works: `mcp-pipeline verify --dir <server>` (install + tsc + tool responsiveness + bridge readiness). Real-device smoke: `scripts/smoke-real-device.sh`.

## 🧱 Architecture

```
im-mcp-codeagent/
├── .claude-plugin/       Claude Code manifest + marketplace
├── .codex-plugin/        Codex manifest (dual-end mirror)
├── skills/               mcp-analyze · mcp-curate · mcp-generate · mcp-pipeline · mcp-test  (methodology, no model calls)
├── commands/             /mcp-pipeline · /mcp-verify · /mcp-help
├── hooks/                SessionStart → polyglot build (run-hook.cmd → session-init.sh)
├── cli/                  @im/mcp-pipeline-cli — deterministic Node
│   ├── src/generators/   rpc-bridge · yunos-adapter-rpc · car-rpc-engine · …
│   ├── assets/           car-rpc-engine.ts.template (bundled, de-hardcoded)
│   └── bin/mcp-pipeline.js
├── framework/            @im/mcp-server-framework (shared dispatch core: constructDbusCall / …)
├── tools/adb/            bundled adb (self-contained; see LICENSE note)
└── schema/               analysis.schema.json + test fixture
```

The CLI runs via a **skill-base-relative path** (`${SKILL_DIR}/../../cli/bin/mcp-pipeline.js`) — self-contained, no PATH / global-link dependency.

## 🛠️ Develop

```bash
cd framework && npm install
cd ../cli     && npm install && npx tsc     # build cli/dist (the real CLI loads dist/ — rebuild after source edits)
cd ../cli     && npx vitest run             # full suite
node scripts/check-manifests.js             # claude / codex manifest drift guard
```

## 📜 License

MIT — see [LICENSE](LICENSE). `tools/adb/` bundles Google's adb under its own terms.

<div align="center">
<sub>CodeAgent @ MCP · BRIDGE — built by Tongji University &amp; IM · controllable MCP for the YunOS cockpit</sub>
</div>
