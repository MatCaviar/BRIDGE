# Codex Visual Workbench Entry

## Goal

When a Codex user asks to run the MCP pipeline or generate an MCP suite from a
YunOS HDT or Android project, guide Codex to launch the existing BRIDGE Electron
Workbench instead of executing the legacy text pipeline.

## Scope

Make the smallest Codex-facing change:

1. Add one `mcp-workbench` skill under `skills/`.
2. The skill launches `scripts/launch-workbench.mjs`, optionally forwarding one
   existing source-directory path.
3. If needed for natural-language discovery, adjust only the existing Codex
   manifest prompt text.

Do not change the Workbench, pipeline stages, launcher implementation, Claude
command, marketplace structure, or generated MCP behavior.

## Behavior

- Natural-language requests to run the MCP pipeline, analyze an Android/YunOS
  app into MCP, or open the visual pipeline should select `mcp-workbench`.
- The skill performs one action: launch the visual Workbench.
- With a valid directory argument, the Workbench import panel is prefilled.
- Without a valid directory, the Workbench opens with an empty import panel.
- On first launch, tell the user that the build may take several minutes and
  allow at least ten minutes for the launcher command.
- On launch failure, report the launcher error. Do not fall back to the legacy
  text pipeline.

## Compatibility

- Keep `commands/mcp-pipeline.md` unchanged for Claude.
- Use the distinct name `mcp-workbench` to avoid the prior same-name
  command/skill collision.
- Reuse the existing launcher as the single source of startup behavior.

## Verification

1. Validate the plugin manifest and skill structure.
2. Confirm Codex discovers `mcp-workbench`.
3. Test launcher behavior with no path and with a representative Android source
   path.
4. Confirm existing plugin tests still pass in proportion to the change.
5. Refresh the local plugin cache and verify the plugin remains enabled.

## Success Criteria

- A natural-language MCP pipeline request routes to the visual Workbench skill.
- The Electron Workbench opens and receives a supplied source path.
- No legacy text-pipeline command runs.
- Existing Claude command behavior remains unchanged.
