#!/usr/bin/env bash
# BLOCKED on P1-T8 (同事装车 RpcEngine.ts + manifest page) — script ready, real run pending device install.
#
# Real-device smoke test for a generated MCP Server's soundstage bridge.
# Mirrors the Phase-1 rpc-client flow (mcp-imaudio/src/rpc/rpc-client.ts):
#   write /sdcard/imrpc/cmd.json → adb -host sendlink page://<app>.yunos.com/rpcagent
#   → poll /sdcard/imrpc/result.json until reqId matches → assert ok + data.
#
# Usage: bash scripts/smoke-real-device.sh <generated-server-dir> <fixture-analysis.json>
# Never run blindly — every step has a prereq check and fails non-zero with a clear message.
set -euo pipefail

# ---- constants (mirror Phase-1 rpc-client.ts) ----
RPC_URL="page://imaudio.yunos.com/rpcagent"
CMD_PATH="/sdcard/imrpc/cmd.json"
RESULT_PATH="/sdcard/imrpc/result.json"
POLL_TIMEOUT_MS=5000
POLL_INTERVAL_MS=150

SERVER_DIR="${1:-}"
FIXTURE="${2:-}"

err() { echo "[smoke] ERROR: $*" >&2; }
die() { err "$*"; exit 1; }

# ---- arg validation ----
[ -n "$SERVER_DIR" ] || die "usage: $0 <generated-server-dir> <fixture-analysis.json>  (missing server dir)"
[ -n "$FIXTURE" ]    || die "usage: $0 <generated-server-dir> <fixture-analysis.json>  (missing fixture path)"
[ -d "$SERVER_DIR" ] || die "server dir not found: $SERVER_DIR"
[ -f "$FIXTURE" ]    || die "fixture not found: $FIXTURE"

# This script is device-blocked (P1-T8). Fail fast if the car-side deliverables are not installed,
# so it never partially runs against an unprepared device.
[ -f "$SERVER_DIR/car-side/RpcEngine.ts" ] || \
  die "car-side/RpcEngine.ts missing in $SERVER_DIR — colleague must build + 装车 first (P1-T8 block). Script will not run."
[ -f "$SERVER_DIR/car-side/manifest-page.json" ] || \
  die "car-side/manifest-page.json missing in $SERVER_DIR — colleague must add the $RPC_URL manifest page (P1-T8 block). Script will not run."

echo "[smoke] server dir : $SERVER_DIR"
echo "[smoke] fixture    : $FIXTURE"
echo "[smoke] rpc url    : $RPC_URL"
echo "[smoke] NOTE: BLOCKED on P1-T8 (同事装车). If you reached here the car-side files exist; ensure the device is actually installed."

# ---- step 1: adb online check ----
echo "[smoke] step 1: checking adb device is online"
command -v adb >/dev/null 2>&1 || die "adb not on PATH. Install platform-tools and ensure adb -host works."
ADB="adb -host"
DEVICES_OUT="$($ADB devices 2>/dev/null || true)"
# Expect a line like "<serial>\tdevice" (not "offline" / "unauthorized").
echo "$DEVICES_OUT" | grep -E "[0-9A-Za-z]+[[:space:]]+device$" >/dev/null \
  || die "no online adb device. 'adb -host devices' output:\n$DEVICES_OUT\n(offline/unauthorized → reconnect; sleeping device → start ZebraAlfred keep-alive)"
echo "[smoke] step 1: OK (device online)"

# ---- step 2: ensure ZebraAlfred keep-alive (device sleeps otherwise — project memory) ----
echo "[smoke] step 2: ensuring ZebraAlfred keep-alive note present (prevents device sleep)"
ZA_CHECK="$($ADB shell dumpsys activity activities 2>/dev/null | grep -iE "zebraalfred" || true)"
if [ -z "$ZA_CHECK" ]; then
  err "ZebraAlfred not detected in running activities. sendlink will likely return exit -1 intermittently."
  die "start ZebraAlfred on the device (keep-alive note) before running this smoke test. See project memory: car-device-wakefulness-dependency."
fi
echo "[smoke] step 2: OK (ZebraAlfred keep-alive present)"

# ---- helpers that mirror rpc-client.ts ----
rpc_call() {
  # $1 = op, $2 = json args. Echoes parsed result.json (reqId-matched) on stdout.
  local op="$1" args="$2"
  local req_id="smoke-$(date +%s)-$$-$RANDOM"
  local cmd_json
  # printf '%s' avoids echo escape issues (matches Phase-1 client); JSON has no single quotes here.
  cmd_json=$(printf '{"reqId":"%s","op":"%s","args":%s}' "$req_id" "$op" "$args")

  # 1. write cmd
  $ADB shell "printf '%s' '$cmd_json' > $CMD_PATH" >/dev/null \
    || die "failed to write $CMD_PATH on device"

  # 2. sendlink (retry once on failure — mirrors client, tolerates transient device sleep)
  if ! $ADB sendlink "$RPC_URL" >/dev/null 2>&1; then
    err "sendlink exit non-zero on first try; retrying once (device-sleep tolerance)"
    $ADB sendlink "$RPC_URL" >/dev/null 2>&1 \
      || die "sendlink to $RPC_URL failed twice. Car RpcEngine not running? manifest page not added? device asleep?"
  fi

  # 3. poll result.json until reqId matches (mirror Phase-1 polling)
  local deadline=$(( $(date +%s%3N) + POLL_TIMEOUT_MS ))
  local raw parsed_ok parsed_req
  while [ "$(date +%s%3N)" -lt "$deadline" ]; do
    raw="$($ADB shell "cat $RESULT_PATH" 2>/dev/null || true)"
    parsed_req="$(printf '%s' "$raw" | grep -oE '"reqId":"[^"]*"' | head -1 | sed 's/.*:"//' | sed 's/"$//')"
    if [ "$parsed_req" = "$req_id" ]; then
      # matched — check ok flag
      if printf '%s' "$raw" | grep -q '"ok":true'; then
        printf '%s' "$raw"
        return 0
      else
        err "rpc returned ok=false for op=$op:"
        printf '%s' "$raw" >&2
        die "rpc error for op=$op (see above)"
      fi
    fi
    # sleepms via fractions of a second (portable)
    sleep "$(printf '%.3f' "$(echo "scale=3; $POLL_INTERVAL_MS/1000" | bc)")" 2>/dev/null || sleep 0.15
  done
  die "rpc timeout: no reqId-matched response for op=$op within ${POLL_TIMEOUT_MS}ms (car RpcEngine running? page reachable?)"
}

# ---- step 3: sendlink reachability probe ----
echo "[smoke] step 3: probing sendlink reachability to $RPC_URL"
# A trivial read confirms the bridge path is wired before we exercise soundstage.
PROBE_RAW="$(rpc_call "soundstage.read" '{}')"
echo "[smoke] step 3: OK (sendlink bridge responded, reqId matched)"

# ---- step 4: soundstage read ----
echo "[smoke] step 4: soundstage read (expect mode/fade/balance)"
READ_RAW="$(rpc_call "soundstage.read" '{}')"
# Extract mode/fade/balance from data (loose parse — the generated server returns these fields).
echo "$READ_RAW" | grep -qE '"(mode|fade|balance)"' \
  || die "soundstage.read response missing mode/fade/balance. raw:\n$READ_RAW"
echo "[smoke] step 4: OK"
echo "[smoke]      read = $(printf '%s' "$READ_RAW" | tr -d '\r')"

# ---- step 5: soundstage set + round-trip compare ----
echo "[smoke] step 5: soundstage set (mode=0) then re-read to compare"
SET_RAW="$(rpc_call "soundstage.set" '{"mode":0}')"
printf '%s' "$SET_RAW" | grep -q '"ok":true' \
  || die "soundstage.set did not return ok=true. raw:\n$SET_RAW"
echo "[smoke] step 5a: set OK"

RE_READ_RAW="$(rpc_call "soundstage.read" '{}')"
RE_MODE="$(printf '%s' "$RE_READ_RAW" | grep -oE '"mode":[^,}]*' | head -1 | sed 's/"mode"://')"
[ -n "$RE_MODE" ] || die "re-read after set returned no mode. raw:\n$RE_READ_RAW"
# mode 0 may serialize as number 0 or string "0"; accept either.
case "$RE_MODE" in
  0|\"0\") echo "[smoke] step 5b: OK (re-read mode=$RE_MODE matches set mode=0)" ;;
  *) die "round-trip mismatch: set mode=0 but re-read mode=$RE_MODE. raw:\n$RE_READ_RAW" ;;
esac

echo "[smoke] ALL STEPS PASSED — soundstage bridge works end-to-end on real device."
