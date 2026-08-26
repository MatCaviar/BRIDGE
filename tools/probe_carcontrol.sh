#!/usr/bin/env bash
# 批量执行 CarControl 候选的路由 probe，只生成报告，不修改 registry 或提升 verified 状态。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CANDIDATES="${CANDIDATES:-$SCRIPT_DIR/carcontrol_tools_candidate.json}"
REPORT="${REPORT:-$ROOT/tmp/carcontrol-probe-report.json}"
mkdir -p "$(dirname "$REPORT")"
PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
  if command -v python3 >/dev/null 2>&1; then PYTHON_BIN=python3
  elif command -v python >/dev/null 2>&1; then PYTHON_BIN=python
  else echo "python 3 is required (or set PYTHON_BIN)" >&2; exit 1
  fi
fi

"$PYTHON_BIN" - "$CANDIDATES" "$SCRIPT_DIR/car_invoke.sh" "$REPORT" <<'PYEOF'
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

candidate_path, invoke_path, report_path = map(Path, sys.argv[1:])
candidates = json.loads(candidate_path.read_text(encoding="utf-8"))
results = []

for candidate in candidates:
    proc = subprocess.run(
        ["bash", str(invoke_path), candidate["id"], "{}", f"probe-{candidate['id']}"],
        capture_output=True,
        text=True,
    )
    output = (proc.stdout + proc.stderr).strip()
    route_ok = proc.returncode == 0 and ('"ok":true' in output or '"detail":"成功"' in output)
    results.append({
        "id": candidate["id"],
        "routeStatus": "route_ok" if route_ok else "route_failed",
        "exitCode": proc.returncode,
        "output": output[-1000:],
    })
    print(f"{results[-1]['routeStatus']}: {candidate['id']}")

report = {
    "generatedAt": datetime.now(timezone.utc).isoformat(),
    "meaning": "route_ok only proves routing/response; verify the physical effect before promoting a capability",
    "results": results,
}
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"report: {report_path}")
PYEOF
