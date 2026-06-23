#!/bin/bash
# SP-D: 幂等就绪 framework + cli，并 build dist（emit）。失败必非零+stderr。
set -euo pipefail
ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # 脚本在 <ROOT>/hooks/
fi
echo "[im-mcp] session-init at $ROOT"

install_if_needed() {
  local dir="$1"
  if [ ! -d "$dir/node_modules" ]; then
    echo "[im-mcp] npm install $dir"
    (cd "$dir" && npm install --no-fund --no-audit) || { echo "[im-mcp] npm install failed: $dir" >&2; exit 1; }
  fi
}
install_if_needed "$ROOT/framework"
install_if_needed "$ROOT/cli"

# build framework FIRST — cli imports @im/mcp-server-framework (→ framework/dist), so
# framework/dist must exist before cli's tsc can resolve it (else TS2307 on fresh install).
if [ ! -f "$ROOT/framework/dist/index.js" ]; then
  echo "[im-mcp] building framework/dist"
  (cd "$ROOT/framework" && npx tsc) || { echo "[im-mcp] framework build failed" >&2; exit 1; }
fi

if [ ! -f "$ROOT/cli/dist/cli.js" ]; then
  echo "[im-mcp] building cli/dist"
  (cd "$ROOT/cli" && npx tsc) || { echo "[im-mcp] cli build failed" >&2; exit 1; }
fi
echo "[im-mcp] ready"
