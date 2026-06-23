#!/usr/bin/env bash
# SP-D Task 2 helper: batch-rewrite bare `mcp-pipeline <subcmd>` command forms in
# skills/*/SKILL.md to the skill-base-relative node invocation.
#
# Target: the token `mcp-pipeline ` immediately followed by one of the CLI
# subcommands, in COMMAND position (code blocks, backticks, or bare lines an
# agent would copy-run). Prose mentions like "the mcp-pipeline CLI" are not
# matched (no subcommand follows).
#
# The replacement uses ${SKILL_DIR} (the skill's base dir, known to the host
# agent at skill-load time) → ../../cli/bin/mcp-pipeline.js.
#
# Usage: bash scripts/rewrite-cli-invocation.sh
# Non-destructive alone; review the diff before committing. Operates on the 4
# SP-D skills only.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS=(mcp-analyze mcp-generate mcp-pipeline mcp-test)
SUBCMD='(validate|scaffold|generate|test|build|register|verify|validate_config|wire_check)'
REPL='node "${SKILL_DIR}/../../cli/bin/mcp-pipeline.js" '

for s in "${SKILLS[@]}"; do
  f="$ROOT/skills/$s/SKILL.md"
  [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }
  # Only rewrite when `mcp-pipeline ` is followed by a subcommand token. Preserve
  # whatever follows (args/flags). Delimiter `#` avoids every special char in
  # both pattern (`|` alternation) and replacement (`/` `$` `{` `}` `"`).
  sed -i -E "s#mcp-pipeline ${SUBCMD}#${REPL}#g" "$f"
  echo "[rewrite] $f"
done

echo "Done. Verify with: grep -rnE 'mcp-pipeline (validate|scaffold|generate|test|build|register|verify|validate_config|wire_check)\\b' skills/ (should be empty)"
