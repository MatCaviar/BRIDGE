# BRIDGE Figure Design Notes

The four figures use the visual language of Qwen UI-Agent Figures 2–5—bright academic canvases, lavender sections, heavy dark outlines, softly raised cards, compact technical props, and friendly robot mascots—while depicting BRIDGE's own architecture and runtime.

The hardware vocabulary is automotive rather than mobile: personal local code-agent workstations, vehicle compute boxes, cockpit/IVI displays, HIL/SIL benches, and full test vehicles. No smartphone or handset imagery is used. Vehicle silhouettes take only broad proportion and lighting-language cues from current IM Motors L6/LS6/LS9 materials; all logos, model names, plates, and brand identifiers are deliberately removed.

## Figure 2 — BRIDGE Overview

Universal inputs enter BRIDGE Analyze. The resulting `function-schema.json` is visibly injected into the upstream Agent, whose MCP call passes through the server and executor to a real device. GUI fallback and safety approval remain explicit secondary paths.

## Figure 3 — BRIDGE Infrastructure

A four-quadrant systems view connects scalable app inputs, a portable runtime, the hybrid function/GUI action space, and the three projections of one analysis contract: Agent function schema, runtime registry, and MCP configuration.

## Figure 4 — BRIDGE Real-Device Runtime

Three tall panels cover health-aware device routing, schema-grounded execution, and evidence review. A bottom recovery loop turns broken outcomes into repair, re-test, and release.

## Figure 5 — BRIDGE Capability Flywheel

Source knowledge bootstraps `analysis.json`, `function-schema.json`, and `registry.json`; a six-stage loop then extracts capabilities, projects schemas, tests Agent injection, records real-device trajectories, judges evidence, and refines the contract.

## Deliverables

- `imagegen-masters/`: original ImageGen raster masters, preserved unchanged.
- Canonical `.png`: the selected raster masters used in reports and slides.
- Canonical `.svg`: self-contained, full-color vector-path reproductions generated at 8-bit color precision, zero speckle filtering, one-level color separation, and no spline simplification. The SVGs contain paths rather than embedded raster images.
