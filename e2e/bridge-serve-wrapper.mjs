#!/usr/bin/env node
/**
 * bridge-serve-wrapper — 在每次 MCP 连接前发现设备并启动 BRIDGE serve。
 *
 * 车热点 adb IP 每次重连都会漂移。MCP stdio server 的
 * --device 是启动时固定的。E2E connector 使用短连接，因此这个 wrapper:
 *   1. 优先使用 BRIDGE_DEVICE/已连接设备，再探测当前热点路由 → spawn 真正的 serve;
 *   2. 在该连接内只代理一个子 server，保持 MCP initialize 与后续调用属于同一会话;
 *   3. 下次短连接会重新探测设备，适应串号或热点 IP 变化。
 *
 * 用法(替代 config 里的 serve args):
 *   cd e2e
 *   node bridge-serve-wrapper.mjs \
 *     -- ../cli/bin/mcp-pipeline.js serve --analysis bridge-analysis.json --timeout 20000
 */
import { spawn } from "child_process";
import { discoverAdbDevice, resolveAdbBinary } from "./device-discovery.mjs";

const ADB = resolveAdbBinary();

function startServe(baseArgs) {
  const device = discoverAdbDevice(ADB);
  let serial;
  if (!device) {
    if (process.env.BRIDGE_STRICT_DEVICE === "1") {
      console.error("[bridge-serve-wrapper] no unique adb device; connect one or set BRIDGE_DEVICE");
      process.exit(1);
    }
    // 无车降级: serve 的工具面/schema 注入不依赖设备(仅 tools/call 连车)。
    // 车端调用将返回设备不可达错误; 设 BRIDGE_STRICT_DEVICE=1 恢复严格失败模式。
    serial = "no-device";
    console.error("[bridge-serve-wrapper] no adb device found; spawning serve with --device no-device (schema/工具面可用, 车端调用将报不可达)");
  } else {
    serial = device.serial;
  }
  console.error(`[bridge-serve-wrapper] serve -> ${serial}`);
  const serveProc = spawn(process.execPath, [...baseArgs, "--device", serial], { stdio: ["pipe", "pipe", "inherit"] });
  serveProc.stdin.on("error", () => {});
  serveProc.stdout.on("error", () => {});
  process.stdin.pipe(serveProc.stdin);
  serveProc.stdout.pipe(process.stdout);
  serveProc.on("exit", (code) => {
    console.error(`[bridge-serve-wrapper] serve exited (${code})`);
    process.stdin.unpipe(serveProc.stdin);
    process.exit(code ?? 1);
  });
  process.on("SIGINT", () => { try { serveProc.kill("SIGINT"); } catch { /* best effort */ } });
  process.on("SIGTERM", () => { try { serveProc.kill("SIGTERM"); } catch { /* best effort */ } });
}

const sep = process.argv.indexOf("--");
const baseArgs = sep >= 0 ? process.argv.slice(sep + 1) : [];
if (baseArgs.length === 0) {
  console.error("usage: bridge-serve-wrapper.mjs -- <serve cmd args...>");
  process.exit(1);
}

startServe(baseArgs);
