# BRIDGE Workbench — Troubleshooting

Real incidents hit while launching `/mcp-pipeline` (the BRIDGE visual workbench).
Each entry: symptom → root cause → detect → fix. Skim the **Symptom** lines when
the workbench won't come up.

> **Version notes**
> - **0.1.11** fixed launcher **argument pollution** — `key=value` / placeholder
>   tokens a confused agent passes (e.g. `app=YunOS`, `dir=aipet`) are now ignored
>   and the import panel opens empty instead of pre-filling a garbage path.
> - **0.1.12** added **fail-fast build timeouts** — `ensureBuilt()` runs
>   `npm run workbench:build` with an idle timer (3 min no output) and a hard cap
>   (8 min), so a stalled build terminates with a diagnosable message instead of
>   blocking forever.
> - **0.1.12 still does NOT handle `ELECTRON_RUN_AS_NODE`** — that is entry #1
>   below, fixed by this commit.
> - The **stale ≤0.1.9 command body** (entry #2) is a session-cache artifact, not
>   a code bug; reload the plugin to refresh it.

---

## 1. Workbench says "已启动" (exit 0) but no window appears / Electron exits instantly

### Symptom
`node scripts/launch-workbench.mjs` prints the success banner and returns exit 0,
but no Electron window opens and `electron.exe` is not in the process list (or
appears then vanishes). Because the launcher spawns Electron with
`stdio: "ignore"`, the crash is silent.

### Root cause
The environment has **`ELECTRON_RUN_AS_NODE=1`** set (User or Process scope).
This is injected by **VS Code** and **Claude Code extension hosts** (both are
Electron apps that run their extension host as a Node child via this flag), and
it is inherited by the launcher and its `electron.exe` child.

With `ELECTRON_RUN_AS_NODE=1`, `electron.exe` runs as **plain Node.js** and does
**not** register the `electron` built-in module. The workbench main process is
ESM (`desktop/dist/main.js`, `"type": "module"`):

```js
import { app, BrowserWindow, dialog, ipcMain } from "electron";
```

Node's ESM resolver then falls back to the **npm `electron` package** at
`node_modules/electron/index.js`, which is just a CommonJS stub that exports the
binary path string and has **no named exports**. Result:

```
file:///.../desktop/dist/main.js:1
import { app, BrowserWindow, dialog, ipcMain } from "electron";
              ^^^^^^^^^^^^^
SyntaxError: The requested module 'electron' does not provide an export named 'BrowserWindow'
    at ModuleJob._instantiate (node:internal/modules/esm/module_job:226:21)
    ...
Node.js v22.21.1
```

(`v22.21.1` here is Electron's embedded Node, **not** the system Node — so
`electron.exe` is in fact running, just in pure-Node mode. A CommonJS
`require("electron")` would fail the same way: it would return the path string
stub, not the built-in. So switching the main process to CJS does **not** fix
this — removing the env var does.)

### Detect
```bash
# Git Bash / sh
echo "${ELECTRON_RUN_AS_NODE:-<unset>}"        # prints 1 → this is the bug

# PowerShell (shows User / Machine / Process scopes)
powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','User'); [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','Machine'); [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE','Process')"

# Confirm by reproducing the crash with visible stdio (run from the plugin root):
env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron.exe desktop/dist/main.js
#   → with the var unset, the window opens (benign "libpng warning: iCCP" may print)
#   → with the var set, you get the SyntaxError above
```

### Fix
Strip `ELECTRON_RUN_AS_NODE` from the child env when spawning Electron. This is
a one-line change in `scripts/launch-workbench.mjs`, after the `env` object is
built:

```js
delete env.ELECTRON_RUN_AS_NODE;
```

**Applied by this commit** to `scripts/launch-workbench.mjs`. On a fresh or
older install (pre-this-fix) in a VS Code or Claude Code extension host, either
apply the same one-line patch or launch with the var removed:

```bash
env -u ELECTRON_RUN_AS_NODE node "${PLUGIN_ROOT}/scripts/launch-workbench.mjs" <app-source-dir>
```

### Why the launcher doesn't see its own failure
It spawns Electron `detached: true`, `child.unref()`, `stdio: "ignore"` so the
workbench outlives the spawning session — by design. The cost: a crashed
Electron leaves no stderr behind. If the banner prints but no window appears,
**always check `ELECTRON_RUN_AS_NODE` first**, then re-run Electron with visible
stdio (above) to read the error.

---

## 2. `/mcp-pipeline` command body tells the agent to "load the mcp-pipeline skill" that no longer exists

### Symptom
Running `/mcp-pipeline` expands a command body that says *"Load and follow the
**mcp-pipeline** skill to run the end-to-end pipeline… validate → analyze →
scaffold → generate → test → build → register → verify → schema_preview"*. The
agent then tries to invoke a `mcp-pipeline` skill and finds nothing (or stalls).

### Root cause
In **0.1.10** the headless `skills/mcp-pipeline/` orchestrator was **deleted**
and `commands/mcp-pipeline.md` was rewritten to do one thing — launch this
visual workbench (see the `fix-mcp-pipeline-command-skill-collision` commit). A
session that cached the **≤0.1.9** command body before the version bump still
expands the old, now-broken body. The installed plugin caches the command body
per session and only refreshes when the manifest version bumps + the plugin is
reloaded.

### Fix
Reload the plugin so the current command body takes effect:

```text
/reload-plugins          # or /exit and relaunch Claude Code
/plugin list             # confirm the active version
```

Then re-run `/mcp-pipeline`. The current body just launches the workbench and
does not reference any `mcp-pipeline` skill. If reloading is not possible right
away, the workbench can still be launched directly (see entry #1's
`env -u … node scripts/launch-workbench.mjs` command) — that is exactly what the
command does.

---

## 3. `npm install --prefix <dir>` reports ENOENT on the cwd's package.json

### Symptom
`npm install --prefix "C:/.../0.1.12"` fails with
`ENOENT: no such file or directory, open 'D:\test\package.json'` (the cwd, not
the prefix).

### Root cause
On this npm/Windows combo, `install --prefix <dir>` still resolved the local
package.json from the cwd for workspace detection, ignoring the prefix.

### Fix
`cd` into the plugin root first, then `npm install`:

```bash
cd "<plugin-root>"
npm install --no-audit --no-fund
npm run workbench:build
```

---

## 4. `workbench:build` hangs at vite "transforming…" (non-TTY)

### Symptom
`npm run workbench:build` sits at `vite v6 building for production…
transforming…` for minutes with ~0% CPU, never emitting chunks.
`ui/dist/index.html` is never produced.

### Root cause
Vite's progress spinner uses carriage-return updates that stall when stdio is a
captured non-TTY pipe (e.g. a background task with `2>&1` into a file). The
build isn't slow — it's stuck on the progress write.

> **0.1.12 note:** the launcher's `ensureBuilt()` now wraps
> `npm run workbench:build` with an idle timer (3 min) and hard cap (8 min), so
> this no longer blocks forever — it fails fast with a clear message. But the
> underlying vite non-TTY stall still happens; the foreground workaround below
> is still the fastest way to actually complete the build.

### Fix
Run the UI build in the **foreground** (real stdio). It finishes in ~1s:

```bash
cd "<plugin-root>/ui"
npx vite build           # foreground; prints "✓ 43 modules transformed" and exits
```

`desktop/dist/main.js` (tsc) builds fine in the background; only the vite step
needs the foreground.
