---
name: bridge-quick-update
description: Use when a user asks to commit, push, and update the local im-mcp-codeagent plugin (提交推送更新本地插件 / bridge-quick-update / ship a new patch). Runs the full deterministic ship+update sequence in one pass - version bump, commit, push to github origin + gitee origin2, refresh the marketplace clone, update the installed plugin, restore the electron binary, verify, then prompt restart.
---

> 🌐 默认用中文与用户交互和输出；命令、标识符、版本号、文件路径保持英文。

# Bridge Quick Update

Ship a new patch of the im-mcp-codeagent plugin to both git remotes and update the
locally-installed Claude Code plugin, in one pass. Every step is deterministic and
idempotent: run them in order, skipping any step whose postcondition already holds.

## Preconditions (verify once, fail fast)

1. Active repo is `D:\workspace\im-mcp-codeagent` (the dev clone on `main`, synced to
   `origin/main`). Run `git rev-parse --show-toplevel`. If it is NOT this path, stop and
   tell the user - do not run against the CodexHome install clone (stale, 0.1.x behind).
2. `origin` = `git@github.com:MatCaviar/im-mcp-codeagent.git` (SSH), `origin2` =
   `git@gitee.com:xuoplex/im-mcp.git` (SSH). Confirm with `git remote -v`. HTTPS to
   github is blocked in this env - if `origin` is HTTPS, stop and report (SSH-only).
3. Branch is `main`. Project convention: commit directly to main, no feature branches.

## Input

Optional arg = a one-line change summary for the commit subject (the `; bump <ver>`
suffix is appended automatically). If omitted, derive the subject from
`git diff --stat HEAD` plus the changed files, matching the scope of a recent commit
(`fix(workbench):`, `fix(plugin):`, `docs(i18n):`, `chore:`).

If the working tree is already clean (nothing to commit), skip Steps 1-2 and go
straight to Step 3 (just refresh + update the installed plugin).

## Step 1 - Bump patch version (skip if already bumped)

Bump the patch component in BOTH `.claude-plugin/plugin.json` (top-level `version`)
and `.claude-plugin/marketplace.json` (`plugins[0].version`), keeping them in sync via
targeted string replacement (preserves formatting). Skip if the working-tree version is
already ahead of HEAD's version. Do NOT touch `.codex-plugin/plugin.json` (separate
Codex cadence).

```bash
node -e '
const fs=require("fs"),cp=require("child_process");
const pj=".claude-plugin/plugin.json", mj=".claude-plugin/marketplace.json";
const cur=JSON.parse(fs.readFileSync(pj,"utf8")).version;
let headV="0.0.0";
try{headV=JSON.parse(cp.execSync("git show HEAD:.claude-plugin/plugin.json",{encoding:"utf8"})).version;}catch(e){}
const cmp=(x,y)=>{const a=x.split(".").map(Number),b=y.split(".").map(Number);return a[0]-b[0]||a[1]-b[1]||a[2]-b[2];};
if(cmp(cur,headV)>0){console.log("SKIP bump: working "+cur+" > HEAD "+headV);process.exit(0);}
const [a,b,c]=cur.split(".").map(Number); const nv=`${a}.${b}.${c+1}`;
let p=fs.readFileSync(pj,"utf8");
p=p.replace(/"version"\s*:\s*"[0-9]+\.[0-9]+\.[0-9]+"/, `"version": "${nv}"`);
fs.writeFileSync(pj,p);
let m=fs.readFileSync(mj,"utf8");
m=m.replace(/"version"\s*:\s*"[0-9]+\.[0-9]+\.[0-9]+"/, `"version": "${nv}"`);
fs.writeFileSync(mj,m);
console.log("BUMPED "+headV+" -> "+nv);
'
```
Capture `<new-version>` = `nv` from the output for later steps.

## Step 2 - Commit (skip if tree clean)

First check `git status`. A recurring side effect of running the cli bin leaves
`cli/package-lock.json` and/or `framework/package-lock.json` dirtied unintentionally -
revert those unless the lockfile changes are intentional:

```bash
git checkout -- cli/package-lock.json framework/package-lock.json 2>/dev/null
git status --short
```

Then stage and commit. Always end the message with the Co-Authored-By trailer and the
`; bump <new-version>` suffix:

```bash
git add -A
git commit -m "<type>(<scope>): <description>; bump <new-version>" \
  -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

Derive `<type>(<scope>): <description>` from the diff if no arg was given. Capture the
commit SHA from `git rev-parse --short HEAD`.

## Step 3 - Push to both remotes

```bash
git push origin main && git push origin2 main
```
Both must succeed. If `origin` (github) fails on connection, SSH is misconfigured - do
NOT fall back to HTTPS (it is blocked); stop and report. Stopping on origin failure
avoids origin/origin2 divergence.

## Step 4 - Refresh the marketplace clone

The marketplace clone is a SEPARATE git clone at
`D:/ClaudeCode/plugins/marketplaces/im-mcp-marketplace` - pushing from the dev repo
updates github but does NOT update this clone, so it must be refreshed explicitly. The
clone is frequently left in **detached HEAD** (claude plugin marketplace update checks
out by commit), so a plain `pull --ff-only` often fails. Use fetch + checkout main +
reset, which works in both detached and on-main states. The clone is a read-only mirror
with no local changes, so `reset --hard` is safe. This also sidesteps the
junction/`installLocation` corruption that can break `claude plugin marketplace update`:

```bash
MC="D:/ClaudeCode/plugins/marketplaces/im-mcp-marketplace"
git -C "$MC" remote set-url origin git@github.com:MatCaviar/im-mcp-codeagent.git
git -C "$MC" fetch origin
git -C "$MC" checkout main 2>/dev/null
git -C "$MC" reset --hard origin/main
```
Verify the clone reached the new commit:
`git -C "$MC" rev-parse --short HEAD` must equal the dev repo's `git rev-parse --short HEAD`.

### Junction safety (only if `claude plugin marketplace update` is used instead)

If you run `claude plugin marketplace update im-mcp-marketplace` and it fails with
"corrupted installLocation ... expected a path inside D:\ClaudeCode\plugins": edit
`D:/ClaudeCode/plugins/known_marketplaces.json` and set the `im-mcp-marketplace` entry's
`installLocation` to `D:\\ClaudeCode\\plugins\\marketplaces\\im-mcp-marketplace` (the
`D:\` form, not `C:\Users\86155\...`), then retry. The direct `git pull` above avoids
this entirely.

## Step 5 - Update the installed plugin

```bash
CLAUDE="C:/Users/86155/AppData/Roaming/npm/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
"$CLAUDE" plugin update im-mcp-codeagent@im-mcp-marketplace
```
This copies the new source into
`D:/ClaudeCode/plugins/cache/im-mcp-marketplace/im-mcp-codeagent/<new-version>/` and runs
`npm install`. electron's post-install (GitHub binary download) is blocked here, so
`node_modules/electron/dist/` and `node_modules/electron/path.txt` will be MISSING - that
is expected; Step 7 restores them.

## Step 6 - npm install in the new cache (skip if node_modules already exists)

If `claude plugin update` did not create `node_modules` (or install was interrupted), run
it manually with the electron binary download skipped (the binary is restored in Step 7,
not downloaded):

```bash
NV=<new-version>
CACHE="D:/ClaudeCode/plugins/cache/im-mcp-marketplace/im-mcp-codeagent/$NV"
[ -d "$CACHE/node_modules" ] || (cd "$CACHE" && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --prefer-offline)
```

## Step 7 - Restore the electron binary from the previous version (skip if already present)

Copy `node_modules/electron/dist/` and `node_modules/electron/path.txt` from the previous
working version's cache into the new one. The electron version is unchanged across
patches, so the binary is reusable. The previous version = the highest existing cache
dir below `<new-version>`:

```bash
NV=<new-version>
ROOT="D:/ClaudeCode/plugins/cache/im-mcp-marketplace/im-mcp-codeagent"
NEW="$ROOT/$NV"
PV=$(ls -1 "$ROOT" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | awk -v cur="$NV" '{if($0==cur)exit; p=$0} END{print p}')
echo "previous version: $PV"
if [ -z "$PV" ]; then echo "NO previous cache to copy electron from - stop and report"; exit 1; fi
if [ -f "$NEW/node_modules/electron/path.txt" ]; then
  echo "SKIP copy: electron already present"
else
  cp -r "$ROOT/$PV/node_modules/electron/dist" "$NEW/node_modules/electron/dist"
  cp "$ROOT/$PV/node_modules/electron/path.txt" "$NEW/node_modules/electron/path.txt"
  echo "copied electron from $PV -> $NV"
fi
```

## Step 8 - Verify

```bash
NV=<new-version>
NEW="D:/ClaudeCode/plugins/cache/im-mcp-marketplace/im-mcp-codeagent/$NV"
(cd "$NEW" && node -e "console.log('electron:', require('electron'))")
```
This must print a path ending in `electron.exe`, NOT throw. If it throws, electron's
`dist/`+`path.txt` are still missing - re-run Step 7.

Optionally confirm the shipped change actually landed in the cache, e.g.
`grep -c "<a key string from your change>" "$NEW/<file>"`.

## Step 9 - Tell the user to restart

The running Claude Code session keeps the OLD plugin version loaded. Tell the user:

> 插件已更新到 `<new-version>`（commit `<sha>`，已推送 github + gitee，cache 已验证）。
> 但当前会话仍加载旧版本 - 请重启 Claude Code 使更新生效（重启前旧版本继续运行）。

Then report a one-line summary: version `old -> new`, commit SHA, both remotes pushed,
plugin cache verified.
