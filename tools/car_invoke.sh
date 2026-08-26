#!/usr/bin/env bash
# 车端 invoke 助手: car_invoke.sh <op> [argsJson] [reqId]
# BRIDGE_DEVICE=<serial>（兼容 DEV）可覆盖自动探测；BRIDGE_ADB 可指定 adb；TIMEOUT=<ms> 可覆盖默认 20000ms。
set -euo pipefail
export MSYS_NO_PATHCONV=1

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

ADB="${BRIDGE_ADB:-adb}"
if [ -z "${BRIDGE_ADB:-}" ] && [ -f "$SCRIPT_DIR/adb/adb.exe" ]; then ADB="$SCRIPT_DIR/adb/adb.exe"; fi

if [ "$#" -lt 1 ]; then
  echo "usage: car_invoke.sh <op> [argsJson] [reqId]" >&2
  exit 2
fi

device="${BRIDGE_DEVICE:-${DEV:-}}"
if [ -z "$device" ]; then
  connected=$("$ADB" devices 2>/dev/null | awk '$2 == "device" {print $1}')
  connected_count=$(printf '%s\n' "$connected" | awk 'NF {n++} END {print n+0}')
  if [ "$connected_count" -eq 1 ]; then
    device=$(printf '%s\n' "$connected" | awk 'NF {print; exit}')
  elif [ "$connected_count" -gt 1 ]; then
    echo "multiple adb devices connected; set BRIDGE_DEVICE=<serial>" >&2
    exit 1
  fi

  candidates=""
  if [ -z "$device" ] && command -v powershell.exe >/dev/null 2>&1; then
    candidates=$(powershell.exe -NoProfile -Command '$n=Get-NetIPConfiguration|Where-Object{$_.NetAdapter.Status -eq "Up"};$n|ForEach-Object{if($_.IPv4DefaultGateway){$_.IPv4DefaultGateway.NextHop};if($_.DNSServer){$_.DNSServer.ServerAddresses}}' 2>/dev/null | tr -d '\r' || true)
  elif [ -z "$device" ] && command -v ip >/dev/null 2>&1; then
    candidates=$(ip route show default 2>/dev/null | awk '/default/ {print $3}' || true)
    if [ -r /etc/resolv.conf ]; then candidates="$candidates $(awk '/^nameserver / {print $2}' /etc/resolv.conf)"; fi
  fi
  for ip in $candidates; do
    case "$ip" in 10.*|192.168.*|172.1[6-9].*|172.2[0-9].*|172.3[01].*) ;; *) continue ;; esac
    serial="$ip:5555"
    "$ADB" connect "$serial" >/dev/null 2>&1 || true
    if [ -n "$("$ADB" -s "$serial" shell getprop ro.product.model 2>/dev/null | tr -d '\r')" ]; then device="$serial"; break; fi
  done
  if [ -z "$device" ]; then
    echo "unable to find a unique adb device; connect one or set BRIDGE_DEVICE=<serial>" >&2
    exit 1
  fi
fi

case "$device" in *:*) "$ADB" connect "$device" >/dev/null 2>&1 || true ;; esac
user="${USER_ID:-$("$ADB" -s "$device" shell am get-current-user 2>/dev/null | tr -d '\r' || true)}"
user="${user:-10}"
node "$ROOT/cli/bin/mcp-pipeline.js" invoke \
  --op "$1" \
  --args "${2:-{}}" \
  --device "$device" \
  --user "$user" \
  --req-id "${3:-probe-$(date +%s)}" \
  --timeout "${TIMEOUT:-20000}" \
  --json
