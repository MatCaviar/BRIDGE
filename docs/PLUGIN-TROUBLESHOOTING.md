# Plugin Load — Troubleshooting

Real incidents hit while Claude Code **loads** the `im-mcp-codeagent` plugin (the
`/reload-plugins` / `/doctor` stage, before any skill or the workbench runs).
Each entry: symptom → root cause → detect → fix. For workbench-launch issues
(window won't open, build hangs) see `WORKBENCH-TROUBLESHOOTING.md` instead.

> **Version notes**
> - **0.1.16** fixed a **redundant `hooks` manifest field** that re-pointed at
>   the auto-discovered `hooks/hooks.json` and produced `1 error during load` —
>   entry #1 below, fixed by this commit.

---

## 1. `/reload-plugins` reports `1 error during load` (plugin still partially works)

### Symptom
After updating to **0.1.15**, `/reload-plugins` prints a summary line ending in:

```
1 error during load.
```

and `/doctor` flags the plugin. The skills/commands still load and the
SessionStart hook still fires, so the plugin looks usable — but the error
recurs on every reload.

### Root cause
`0.1.15` added a `hooks` field to `.claude-plugin/plugin.json`:

```json
"hooks": "./hooks/hooks.json",
```

This field is **redundant**. Claude Code already auto-discovers a plugin's hooks
from `<plugin-root>/hooks/hooks.json` by convention — this is the canonical
location, and every well-formed plugin (e.g. `superpowers`) relies on it without
declaring a `hooks` field. The manifest `hooks` field is documented as
*"additional hooks (in addition to those in hooks/hooks.json, if it exists)"* —
i.e. it is meant for hooks **beyond** the auto-discovered file, not for
re-pointing at it.

Pointing the field back at `./hooks/hooks.json` makes the loader process the
same hook file twice (once by convention, once via the field); the field-path
load then rejects the file's `{ "hooks": { … } }` wrapper and surfaces as
`1 error during load`. The convention path still succeeds, which is why the
SessionStart hook keeps running and the count still reads `2 hooks`.

### Detect
```bash
# In the plugin root (marketplace clone or cache install):
grep -n '"hooks"' .claude-plugin/plugin.json
#   → a "hooks": "./hooks/hooks.json" line means you have the bug
```

`/doctor` names the offending plugin; `/reload-plugins` appends
`1 error during load.` to its summary.

### Fix
**Delete the `hooks` line from `.claude-plugin/plugin.json`.** Do nothing else —
`hooks/hooks.json` stays where it is and is still auto-discovered, so the
SessionStart hook keeps working (this is exactly how `superpowers` does it).

```diff
   "skills": ["./skills/"],
   "commands": ["./commands/"],
-  "hooks": "./hooks/hooks.json",
   "defaultEnabled": true
```

Then `/reload-plugins` — the `1 error during load.` line is gone.

**Applied by this commit** (shipped from **0.1.16**). On an older install
(0.1.15), either update to 0.1.16 or apply the one-line deletion above.

### Why the field is tempting but wrong
A `hooks` field pointing at `hooks/hooks.json` *looks* like it declares the hook
source — but Claude Code's plugin loader treats `hooks/hooks.json` as the
canonical, auto-discovered location and treats the manifest `hooks` field as a
channel for *extra* hooks. Re-pointing it at the canonical file is a no-op at
best and a double-load error at worst. Leave the field out; let the convention
do its job.
