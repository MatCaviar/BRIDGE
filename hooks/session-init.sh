#!/bin/bash
# SP-D: prepare framework + cli and build emitted dist; failures must be non-zero.
set -euo pipefail

ROOT="${CLAUDE_PLUGIN_ROOT:-}"
if [ -z "$ROOT" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"   # script is in <ROOT>/hooks/
fi
echo "[im-mcp] session-init at $ROOT"

install_if_needed() {
  local dir="$1"
  if [ ! -d "$dir/node_modules" ]; then
    echo "[im-mcp] npm install $dir"
    (cd "$dir" && npm install --no-fund --no-audit) || { echo "[im-mcp] npm install failed: $dir" >&2; exit 1; }
  fi
}

newer_than() {
  local out="$1"
  shift
  local path
  for path in "$@"; do
    [ -e "$path" ] || continue
    if [ "$path" -nt "$out" ]; then
      return 0
    fi
    if [ -d "$path" ] && [ -n "$(find "$path" -type f -newer "$out" -print -quit)" ]; then
      return 0
    fi
  done
  return 1
}

needs_build() {
  local dir="$1"
  local out="$2"
  [ ! -f "$out" ] || newer_than "$out" "$dir/src" "$dir/bin" "$dir/package.json" "$dir/tsconfig.json"
}

install_if_needed "$ROOT/cli"

if needs_build "$ROOT/cli" "$ROOT/cli/dist/cli.js"; then
  echo "[im-mcp] building cli/dist"
  (cd "$ROOT/cli" && npx tsc) || { echo "[im-mcp] cli build failed" >&2; exit 1; }
fi
echo "[im-mcp] ready"
