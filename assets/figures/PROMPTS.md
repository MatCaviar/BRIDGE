# BRIDGE Figure Design Notes

The four figures use the visual language of Qwen UI-Agent Figures 2–5—bright academic canvases, lavender sections, heavy dark outlines, softly raised cards, compact technical props, and friendly robot mascots—while depicting BRIDGE's own architecture and runtime.

The hardware vocabulary is automotive rather than mobile: personal local code-agent workstations, vehicle compute boxes, cockpit/IVI displays, HIL/SIL benches, and full test vehicles. No smartphone or handset imagery is used. Vehicle silhouettes take only broad proportion and stance cues from current premium EV liftback, five-seat SUV, and flagship three-row SUV references; all logos, model names, plates, and brand identifiers are deliberately removed.

Cockpit screens retain the dimensional illustration style of the surrounding hardware while using a current flat HMI language: panoramic display proportions, large primary values, sparse navigation/media/seat-zone modules, hairline dividers, and a slim in-screen action rail. Dark surfaces are confined to actual display glass so the overall figures remain bright and clean.

## Figure 2 — BRIDGE Overview

Universal inputs enter BRIDGE Analyze. The resulting `function-schema.json` is visibly injected into the upstream Agent, whose MCP call passes through the server and executor to a real device. GUI fallback and safety approval remain explicit secondary paths.

## Figure 3 — BRIDGE Implementation Architecture

Figure 3 is deliberately an internal implementation cutaway rather than another execution overview. The `bridge-analyze` plugin feeds a dominant canonical `analysis.json` capability IR. Its Agent-facing fields (`id`, `description`, `params`, safety) and execution-facing fields (`status`, `sourceRef`, mechanism, route) drive five deterministic projections: `function-schema.json`, MCP `tools/list`, OpenAI tools, Anthropic tools, and `registry.json`.

Below the contract, `mcp-pipeline schema / serve / invoke` form the host runtime. The ADB `cmd.json ↔ result.json` mailbox joins it to the generic `Bridge Executor`, whose external registry selects AIDL, execmd, Intent, media, mapnav, or carcontrol adapters. A cross-cutting rail represents live visualization, schema injection checks, contract tests, invoke tests, and E2E smoke tests. Upstream-Agent dialogue, app inputs, real vehicles, cockpit UI, GUI fallback, and safety approval are intentionally absent because Figure 2 already owns that end-to-end narrative.

### Figure 3 final ImageGen prompt

Create a full-width 16:9 internal implementation cutaway for BRIDGE. Match the bright Qwen UI-Agent-inspired academic material language of the other BRIDGE figures: off-white canvas, heavy clean charcoal outlines, softly raised white and lavender cards, violet/blue connectors, shallow pseudo-3D technical props, soft studio contact shadows, generous whitespace, and no dark background. Use a central contract motherboard composition: a language-neutral canonical layered dossier in the center; a compact plugin-analysis workstation and three analyzer modules on the left; five schema/registry projection cards plugged into the right; two lower runtime chassis for the host CLI and vehicle executor; a raised two-document ADB mailbox between them; six clean mechanism sockets in the vehicle chassis; and a thin observability/test bus across the bottom. This must look like an implementation architecture, not a sequential task flow. Do not show universal input files, an upstream chatbot, a real car, cockpit UI, GUI fallback, safety approval, phone, logo, watermark, or pseudo-text. Leave a large blank header and clean blank label plates for deterministic localization.

## Figure 4 — BRIDGE Real-Device Runtime

Three tall panels cover health-aware device routing, schema-grounded execution, and evidence review. A bottom recovery loop turns broken outcomes into repair, re-test, and release.

The Simplified Chinese edition is localized directly from the selected English master. All vehicles, benches, cockpit screenshots, mascots, cards, connectors, shadows, spacing, and proportions are retained; only the English label areas are replaced with Chinese KaiTi typography. Technical identifiers such as `BRIDGE`, `Schema`, `MCP`, `CAN`, `UI`, and JSON code remain unchanged where appropriate.

## Figure 5 — BRIDGE Capability Flywheel

Source knowledge bootstraps `analysis.json`, `function-schema.json`, and `registry.json`; a six-stage loop then extracts capabilities, projects schemas, tests Agent injection, records real-device trajectories, judges evidence, and refines the contract.

The Simplified Chinese edition uses the English master as the immutable visual base and changes only label text. The source panel, contract scroll, capability pool, six flywheel sectors, central robot-and-runtime composition, cockpit rig, and unbranded test vehicles therefore remain visually identical between languages.

## Deliverables

- `imagegen-masters/*.en-imagegen.png`: English raster masters based on the selected ImageGen compositions.
- `imagegen-masters/*.zh-CN-imagegen.png`: Simplified Chinese raster masters with KaiTi-style Chinese typography, based on the selected ImageGen compositions.
- `imagegen-masters/bridge-figure-3-infrastructure-implementation-base-imagegen.png`: selected language-neutral Figure 3 ImageGen mother image before deterministic labels.
- `imagegen-masters/bridge-figure-3-infrastructure-concept-a-imagegen.png`: retained alternate Figure 3 implementation-architecture concept.
- `*.en.png` and `*.zh-CN.png`: explicit English and Simplified Chinese raster editions.
- Unsuffixed `.png`: the English edition used as the default report/slide asset.
- `*.en.svg` and `*.zh-CN.svg`: self-contained, full-color vector-path reproductions generated at 8-bit color precision, zero speckle filtering, one-level color separation, and no spline simplification. The SVGs contain paths rather than embedded raster images, so the Chinese edition does not depend on local font installation.
- Unsuffixed `.svg`: the English vector edition used as the default.
