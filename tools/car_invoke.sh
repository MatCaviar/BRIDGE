#!/usr/bin/env bash
# 车端 invoke 助手: car_invoke.sh <op> [argsJson] [reqId]
# 自动探测车机 IP(热点 DNS)与前台用户; 可用 DEV=10.x.x.x:5555 覆盖。
export MSYS_NO_PATHCONV=1
D="${DEV:-}"
if [ -z "$D" ]; then
  IP=$(powershell.exe -NoProfile -Command "(Get-DnsClientServerAddress -AddressFamily IPv4 -InterfaceAlias 'WLAN' | Select-Object -First 1).ServerAddresses[0]" 2>/dev/null | tr -d '\r')
  D="$IP:5555"
  adb connect "$D" >/dev/null 2>&1
fi
U=$(adb -s "$D" shell "am get-current-user" 2>/dev/null | tr -d '\r')
FDIR="/data/user/$U/com.immotors.bridge.executor/files"
OWNER="u${U}_a206"
op="$1"; args="${2:-{\}}"; rid="${3:-r}"
printf '%s' "{\"reqId\":\"$rid\",\"op\":\"$op\",\"args\":$args}" > D:/IM/bridge_test/cmd.json
adb -s "$D" push "D:/IM/bridge_test/cmd.json" /data/local/tmp/cmd.json >/dev/null 2>&1
adb -s "$D" shell "cp /data/local/tmp/cmd.json $FDIR/imrpc/cmd.json && chown $OWNER:$OWNER $FDIR/imrpc/cmd.json && chmod 660 $FDIR/imrpc/cmd.json && rm -f $FDIR/imrpc/result.json" >/dev/null 2>&1
adb -s "$D" shell "am start --user $U -n com.immotors.bridge.executor/.ExecutorActivity" >/dev/null 2>&1
sleep 2
echo "[u$U $D] [$op] $(adb -s "$D" shell "cat $FDIR/imrpc/result.json 2>/dev/null")"
