#!/usr/bin/env bash
# Compatibility entrypoint; the CLI owns request isolation and transport behavior.
set -euo pipefail
SUITE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$SUITE_DIR/cli/bin/mcp-pipeline.js" invoke "$@"
