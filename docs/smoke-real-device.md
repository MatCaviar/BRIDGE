# Real-Device Smoke Test

> **STATUS: BLOCKED on P1-T8** — the script (`scripts/smoke-real-device.sh`) is ready and correct-by-inspection, but a real run is pending the colleague 装车 (car-side install). It is intentionally fail-fast until the car-side deliverables are installed.

This smoke test exercises a **generated** MCP Server's soundstage bridge end-to-end on a real YunOS HDT device. It mirrors the Phase-1 `rpc-client` flow (`mcp-imaudio/src/rpc/rpc-client.ts`): write `/sdcard/imrpc/cmd.json` → `adb -host sendlink page://imaudio.yunos.com/rpcagent` → poll `/sdcard/imrpc/result.json` until the `reqId` matches → assert `ok` + data.

## Prerequisites (装车 dependency)

All of these must be true before running. The first three are owned by the colleague and block P1-T8:

1. **Car-side `RpcEngine.ts` built + installed** on the device. This is delivered by `scaffold` under `<server>/car-side/RpcEngine.ts` — the colleague builds and 装车s it.
2. **`page://imaudio.yunos.com/rpcagent` manifest page added** to the device so `sendlink` can reach the engine.
3. **`adb -host` works** against the target device (`adb -host devices` shows it as `device`, not `offline`/`unauthorized`).
4. **ZebraAlfred is running** on the device (keep-alive note). Without it the device sleeps and `sendlink` intermittently returns exit -1. See project memory: `car-device-wakefulness-dependency`.

## Run command

```bash
bash scripts/smoke-real-device.sh <generated-server-dir> <fixture-analysis.json>
```

Example:

```bash
bash scripts/smoke-real-device.sh mcp-imaudio .mcp-pipeline/imaudio/analysis.json
```

The script:

1. **Fails fast** if `<server>/car-side/RpcEngine.ts` or `<server>/car-side/manifest-page.json` are missing (i.e. not yet 装车).
2. Checks an adb device is **online**.
3. Confirms **ZebraAlfred** keep-alive is running.
4. Probes `sendlink` reachability with a `soundstage.read`.
5. Does a `soundstage.read` and asserts `mode`/`fade`/`balance` are present.
6. Does a `soundstage.set {mode:0}`, then re-reads and asserts the round-trip matches.

Every step has a prereq check and fails non-zero with a clear message. Uses `set -euo pipefail`.

## Expected output

```
[smoke] step 1: OK (device online)
[smoke] step 2: OK (ZebraAlfred keep-alive present)
[smoke] step 3: OK (sendlink bridge responded, reqId matched)
[smoke] step 4: OK
[smoke]      read = {"reqId":"...","ok":true,"data":{"mode":"0","fade":0,"balance":0}}
[smoke] step 5a: set OK
[smoke] step 5b: OK (re-read mode=0 matches set mode=0)
[smoke] ALL STEPS PASSED — soundstage bridge works end-to-end on real device.
```

- **soundstage read** returns `{ mode, fade, balance }` in `data`.
- **soundstage set** returns `ok: true`; a follow-up read reflects the set value (round-trip).

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `no online adb device` | Device offline/unauthorized — reconnect `adb -host`; or device is **asleep** → start **ZebraAlfred** keep-alive note (project memory). |
| `sendlink ... failed twice` / intermittent `exit -1` | Device sleeping (ZebraAlfred not running) — start ZebraAlfred; or car `RpcEngine` not running — confirm 装车 succeeded; or manifest `page://` page not added. |
| `rpc timeout: no reqId-matched response` | Car `RpcEngine` received the cmd but did not write a matching `result.json` — check the engine is running and the `page://imaudio.yunos.com/rpcagent` route is wired; verify `/sdcard/imrpc/` is writable. |
| `ZebraAlfred not detected` | Keep-alive not started — launch ZebraAlfred on the device before running (mandatory; the device will otherwise sleep mid-poll). |
| `round-trip mismatch: set mode=0 but re-read mode=...` | Car engine applied a different value or the op mapping is wrong — inspect the generated `rpc/config.json` `soundstage_read`/`soundstage_set` entries vs. the car `RpcEngine`. |
| `car-side/RpcEngine.ts missing` / `manifest-page.json missing` | P1-T8 not done — colleague must build + 装车 first. Script intentionally refuses to run. |

## Reference

- Phase-1 bridge flow: `mcp-imaudio/src/rpc/rpc-client.ts` (`RPC_URL`, `CMD_PATH`, `RESULT_PATH`, reqId poll loop).
- Phase-1 soundstage config: `_sp_b_regression/mcp-imaudio/rpc/config.json`.
- Generated adapter (op names `soundstage.read` / `soundstage.set`): `mcp-imaudio/src/adapters/yunos-adapter.ts`.
