// Launches the BRIDGE visual workbench (Electron) as an independent process.
//
// Invoked by the `/im-mcp-codeagent:mcp-pipeline` command:
//   node scripts/launch-workbench.mjs [app源码目录]
//
// - Resolves the agent backend (claude preferred, codex fallback) and its real
//   executable path so the in-process control-server can spawn it with shell:false.
// - Builds dist on first run with an idle + hard timeout so a stalled build fails
//   fast with a diagnosable message instead of blocking forever; later launches
//   skip the build for a fast start.
// - Detaches the Electron window and returns immediately; closing the window
//   stops the workbench and its child processes.
// - When a source path is supplied it is forwarded as BRIDGE_INITIAL_SOURCE so
//   the 导入 panel opens with the source directory pre-filled.
import { createRequire } from "node:module";
import { execSync, spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const repoRoot = resolvePath(fileURLToPath(import.meta.url), "..", "..");
const scriptsDir = resolvePath(repoRoot, "scripts");

// The first positional that resolves to an EXISTING directory is the app source
// directory. Flags (--step/--from, headless skill mode) and any non-path /
// key=value / placeholder tokens a confused agent may pass (e.g. "app=YunOS",
// "dir=aipet") are ignored — the workbench then opens with an empty 导入 panel so
// the user picks inside it. Never pre-fill a garbage path into the import panel.
const initialSource = process.argv.slice(2)
  .filter((arg) => !arg.startsWith("-") && !arg.includes("="))
  .map((arg) => resolvePath(process.cwd(), arg))
  .find((p) => existsSync(p) && statSync(p).isDirectory()) ?? "";

const BUILD_IDLE_TIMEOUT_MS = 180_000; // no build output for 3 min => likely hung
const BUILD_HARD_TIMEOUT_MS = 8 * 60_000; // 8 min hard cap (agent should allow ≥10 min)

async function ensureBuilt() {
  const mainJs = resolvePath(repoRoot, "desktop/dist/main.js");
  const indexHtml = resolvePath(repoRoot, "ui/dist/index.html");
  if (existsSync(mainJs) && existsSync(indexHtml)) return;
  console.log("");
  console.log("⏳ 首次启动:工作台尚未构建,正在构建 4 个 workspace(workbench-contracts / control-server / desktop / ui)。");
  console.log("   通常需要 2-5 分钟,期间请勿中断;构建完成后会自动打开窗口。");
  console.log("");
  const result = await runBuild();
  if (!result.ok) {
    console.error("");
    console.error(buildFailureMessage(result));
    process.exit(1);
  }
  console.log("");
  console.log("✅ 构建完成,正在解析 agent 后端并启动工作台…");
  console.log("");
}

/** Runs `npm run workbench:build` as a child process, forwarding output in real time,
 *  with an idle timer (no output => likely hung) and a hard cap. npm's `--workspaces`
 *  orchestration can stall silently on some Windows setups; the idle timer turns that
 *  indefinite stall into a clean, diagnosable failure instead of blocking forever. */
function runBuild() {
  return new Promise((resolve) => {
    const cmd = process.platform === "win32" ? "npm.cmd" : "npm";
    const child = spawn(cmd, ["run", "workbench:build"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let settled = false;
    let idleTimer;
    let hardTimer;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(hardTimer);
      resolve(result);
    };
    hardTimer = setTimeout(() => {
      console.error("\n❌ 构建超过 8 分钟,强制终止。");
      killTree(child);
      settle({ ok: false, reason: "hard-timeout" });
    }, BUILD_HARD_TIMEOUT_MS);
    const armIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        console.error("\n❌ 构建超过 3 分钟无输出,疑似卡死(npm --workspaces 在个别环境下会静默停滞)。正在终止…");
        killTree(child);
        settle({ ok: false, reason: "idle" });
      }, BUILD_IDLE_TIMEOUT_MS);
    };
    child.stdout.on("data", (chunk) => { process.stdout.write(chunk); armIdle(); });
    child.stderr.on("data", (chunk) => { process.stderr.write(chunk); armIdle(); });
    child.on("error", (err) => {
      console.error(`\n❌ 无法启动构建进程: ${err.message}`);
      settle({ ok: false, reason: "spawn-error", error: err.message });
    });
    child.on("exit", (code, signal) => {
      if (code === 0) settle({ ok: true });
      else settle({ ok: false, reason: "nonzero", code, signal });
    });
    armIdle();
  });
}

/** Kill the build child and its descendants. On Windows `taskkill /T /F` walks the
 *  tree; on Unix the child runs in its own process group (detached) so -pid kills it. */
function killTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    try { child.kill("SIGKILL"); } catch { /* already dead */ }
  }
}

function buildFailureMessage(result) {
  const hint = "请手动在插件根目录运行 `npm run workbench:build` 查看完整错误;常见原因:某 workspace 的 tsc 报错、依赖未安装(先 `npm install`)。修复后重新运行 /mcp-pipeline 即可(此后启动会跳过构建)。";
  const reason = result.reason === "idle" ? "超过 3 分钟无输出,疑似卡死"
    : result.reason === "hard-timeout" ? "超过 8 分钟"
    : result.reason === "nonzero" ? `构建进程退出码 ${result.code ?? "?"}`
    : result.reason === "spawn-error" ? `无法启动构建进程 — ${result.error}`
    : "未知原因";
  return `❌ 工作台构建失败,无法启动可视化(原因:${reason})。\n${hint}`;
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

await ensureBuilt();

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
// Strip ELECTRON_RUN_AS_NODE so electron.exe runs as a real Electron GUI and
// not as plain Node. VS Code / Claude Code extension hosts set
// ELECTRON_RUN_AS_NODE=1, which is inherited here. With it set, electron.exe
// skips registering the `electron` built-in module, so the ESM main process
// (`import { BrowserWindow } from "electron"`) resolves to the npm `electron`
// stub (no named exports) and crashes:
//   SyntaxError: The requested module 'electron' does not provide an export
//   named 'BrowserWindow'
// The launcher prints "已启动" + exit 0 (Electron is spawned detached with
// stdio:"ignore"), so the crash is silent — no window appears. See
// docs/WORKBENCH-TROUBLESHOOTING.md.
delete env.ELECTRON_RUN_AS_NODE;

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
