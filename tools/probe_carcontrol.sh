#!/usr/bin/env bash
# 批量 probe carcontrol 候选工具: 把 status=candidate 的工具逐个 invoke, 验证通过的写回 registry
set -e
REG="D:/IM/bridge_test/car_registry.json"
CAND="D:/IM/bridge_test/carcontrol_tools_candidate.json"
python - "$REG" "$CAND" <<'PYEOF'
import json, sys, subprocess, re
reg_path, cand_path = sys.argv[1], sys.argv[2]
reg = json.load(open(reg_path, encoding='utf-8'))
cands = json.load(open(cand_path, encoding='utf-8'))
existing = {t['id'] for t in reg['tools']}
verified = []
for t in cands:
    if t['id'] in existing:
        continue
    out = subprocess.run(['bash', 'D:/IM/bridge_test/car_invoke.sh', t['id'], '{}', 'probe'], capture_output=True, text=True).stdout
    ok = '\"detail\":\"成功\"' in out or '"detail":"成功"' in out
    if ok:
        t['status'] = 'verified'
        reg['tools'].append(t)
        verified.append(t['id'])
        print('VERIFIED:', t['id'])
    else:
        print('skip:', t['id'], out[:80])
json.dump(reg, open(reg_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('done, verified:', len(verified))
PYEOF
