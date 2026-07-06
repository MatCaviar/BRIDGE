// Launches the BRIDGE visual workbench (Electron) as an independent process.
//
// Invoked by the `/im-mcp-codeagent:mcp-pipeline` command:
//   node scripts/launch-workbench.mjs [app源码目录]
//
// - Resolves the agent backend (claude preferred, codex fallback) and its real
//   executable path so the in-process control-server can spawn it with shell:false.
// - Builds dist on first run; later launches skip the build for a fast start.
// - Detaches the Electron window and returns immediately; closing the window
//   stops the workbench and its child processes.
// - When a source path is supplied it is forwarded as BRIDGE_INITIAL_SOURCE so
//   the 导入 panel opens with the source directory pre-filled.
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolvePath(fileURLToPath(import.meta.url), "..", "..");
const scriptsDir = resolvePath(repoRoot, "scripts");

// First non-flag positional argument is the app source directory; flags such as
// --step/--from (headless skill mode) are ignored in visual mode.
const sourcePath = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
const initialSource = sourcePath ? resolvePath(process.cwd(), sourcePath) : "";

function ensureBuilt() {
  const mainJs = resolvePath(repoRoot, "desktop/dist/main.js");
  const indexHtml = resolvePath(repoRoot, "ui/dist/index.html");
  if (existsSync(mainJs) && existsSync(indexHtml)) return;
  console.log("[workbench] dist 缺失,正在构建…");
  execSync("npm run workbench:build", { cwd: repoRoot, stdio: "inherit" });
}

function resolveExecutable(backend) {
  const envVar = backend === "claude" ? "CLAUDE_EXECUTABLE" : "CODEX_EXECUTABLE";
  if (process.env[envVar]) return process.env[envVar];
  if (process.platform === "win32") {
    const script = resolvePath(scriptsDir, backend === "claude" ? "resolve-claude-executable.ps1" : "resolve-codex-executable.ps1");
    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${script}"`, { encoding: "utf8" }).trim();
    if (!out) throw new Error(`${backend} 解析器未返回可执行文件路径`);
    return out;
  }
  // On macOS/Linux the npm-installed CLI is a shebang symlink — spawnable with shell:false.
  return backend;
}

function resolveBackend() {
  const preferred = (process.env.AGENT_BACKEND || "claude").toLowerCase();
  const order = preferred === "codex" ? ["codex", "claude"] : ["claude", "codex"];
  let lastError;
  for (const backend of order) {
    try {
      return { backend, executable: resolveExecutable(backend) };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`未找到可用的 agent 后端 (尝试过 ${order.join(" / ")}): ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

ensureBuilt();

let electronPath;
try {
  electronPath = require("electron");
} catch {
  throw new Error("electron 未安装,请在插件根目录运行 `npm install`");
}

const { backend, executable } = resolveBackend();
const env = { ...process.env, AGENT_BACKEND: backend };
if (backend === "claude") env.CLAUDE_EXECUTABLE = executable;
else env.CODEX_EXECUTABLE = executable;
if (initialSource) env.BRIDGE_INITIAL_SOURCE = initialSource;

const child = spawn(electronPath, [resolvePath(repoRoot, "desktop/dist/main.js")], {
  cwd: repoRoot,
  detached: true,
  stdio: "ignore",
  windowsHide: false,
  env,
});
child.unref();

console.log("BRIDGE 可视化工作台已启动");
console.log(`  后端: ${backend} (${executable})`);
console.log(`  初始源码路径: ${initialSource || "(未提供 — 请在导入面板手动选择)"}`);
console.log("关闭窗口即可停止工作台及其子进程。");
