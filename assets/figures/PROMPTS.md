# BRIDGE Figure Design Notes

The four figures use the visual language of Qwen UI-Agent Figures 2–5—bright academic canvases, lavender sections, heavy dark outlines, softly raised cards, compact technical props, and friendly robot mascots—while depicting BRIDGE's own architecture and runtime.

The hardware vocabulary is automotive rather than mobile: personal local code-agent workstations, vehicle compute boxes, cockpit/IVI displays, HIL/SIL benches, and full test vehicles. No smartphone or handset imagery is used. Vehicle silhouettes take only broad proportion and stance cues from current premium EV liftback, five-seat SUV, and flagship three-row SUV references; all logos, model names, plates, and brand identifiers are deliberately removed.

Cockpit screens retain the dimensional illustration style of the surrounding hardware while using a current flat HMI language: panoramic display proportions, large primary values, sparse navigation/media/seat-zone modules, hairline dividers, and a slim in-screen action rail. Dark surfaces are confined to actual display glass so the overall figures remain bright and clean.

## Figure 2 — BRIDGE Overview

Universal inputs enter BRIDGE Analyze. The resulting `function-schema.json` is visibly injected into the upstream Agent, whose MCP call passes through the server and executor to a real device. GUI fallback and safety approval remain explicit secondary paths.

## Figure 3 — BRIDGE Infrastructure

A four-quadrant systems view connects scalable app inputs, a portable runtime, the hybrid function/GUI action space, and the three projections of one analysis contract: Agent function schema, runtime registry, and MCP configuration.

## Figure 4 — BRIDGE Real-Device Runtime

Three tall panels cover health-aware device routing, schema-grounded execution, and evidence review. A bottom recovery loop turns broken outcomes into repair, re-test, and release.

## Figure 5 — BRIDGE Capability Flywheel

Source knowledge bootstraps `analysis.json`, `function-schema.json`, and `registry.json`; a six-stage loop then extracts capabilities, projects schemas, tests Agent injection, records real-device trajectories, judges evidence, and refines the contract.

## Deliverables

- `imagegen-masters/*.en-imagegen.png`: original English ImageGen raster masters, preserved unchanged.
- `imagegen-masters/*.zh-CN-imagegen.png`: original Simplified Chinese ImageGen raster masters with KaiTi-style Chinese typography, preserved unchanged.
- `*.en.png` and `*.zh-CN.png`: explicit English and Simplified Chinese raster editions.
- Unsuffixed `.png`: the English edition used as the default report/slide asset.
- `*.en.svg` and `*.zh-CN.svg`: self-contained, full-color vector-path reproductions generated at 8-bit color precision, zero speckle filtering, one-level color separation, and no spline simplification. The SVGs contain paths rather than embedded raster images, so the Chinese edition does not depend on local font installation.
- Unsuffixed `.svg`: the English vector edition used as the default.
