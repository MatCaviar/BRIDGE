import { useEffect, useState } from "react";
import { workbenchApi } from "../bridge/client";
import { useWorkbench } from "../state/workbench";

export function CurateStudio() {
  const { project, artifacts, refresh, setError } = useWorkbench();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(new Set((artifacts?.capabilities ?? []).filter((capability) => capability.selected).map((capability) => capability.id))), [artifacts]);
  const capabilities = artifacts?.capabilities ?? [];
  const save = async () => { if (!project) return; setSaving(true); try { await workbenchApi.selection(project.id, [...selected]); await refresh(); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } finally { setSaving(false); } };
  return <section id="Curate" className="panel glass"><div className="panel-title"><div><p className="eyebrow">04 / CURATE STUDIO</p><h2>选择 MCP 化能力</h2></div><span className="metric accent">{selected.size}/{capabilities.length}</span></div><div className="toolbar"><button onClick={() => setSelected(new Set(capabilities.map((capability) => capability.id)))}>全选</button><button onClick={() => setSelected(new Set())}>清空</button><button className="primary" disabled={saving || !project} onClick={() => void save()}>{saving ? "写入中…" : "保存 selection.json"}</button></div><div className="curate-list">{capabilities.map((capability) => {
    const status = capability.realExecutable ? "REAL READY" : capability.mockExecutable ? "MOCK READY · REAL BLOCKED" : "NOT BUILT";
    return <label key={capability.id} className={selected.has(capability.id) ? "selected" : ""}><input type="checkbox" checked={selected.has(capability.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(capability.id) ? next.delete(capability.id) : next.add(capability.id); return next; })} /><span><b>{capability.id}</b><small>{capability.sourceRef}</small>{capability.blockedReason && <small className="blocked-reason">{capability.blockedReason}</small>}</span><em>{status}</em></label>;
  })}</div></section>;
}
