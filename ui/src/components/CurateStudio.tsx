import { useEffect, useState } from "react";
import { workbenchApi } from "../bridge/client";
import { useWorkbench } from "../state/workbench";

export function CurateStudio() {
  const { project, artifacts, pipelineRun, refresh, setError } = useWorkbench();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  useEffect(() => setSelected(new Set((artifacts?.capabilities ?? []).filter((capability) => capability.selected).map((capability) => capability.id))), [artifacts]);
  const capabilities = artifacts?.capabilities ?? [];
  const awaiting = pipelineRun?.status === "awaiting_curate";
  const save = async () => {
    if (!project) return;
    if (!selected.size) return setError("请至少选择一个源码支持的接口");
    setSaving(true); setError(undefined);
    try { await workbenchApi.selection(project.id, [...selected]); await refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  };
  return <section id="筛选" className="panel glass">
    <div className="panel-title"><div><p className="eyebrow">04 / 筛选工作台</p><h2>选择 MCP 化接口</h2></div><span className="metric accent">{selected.size}/{capabilities.length}</span></div>
    <p className="muted">候选接口只来自源码。确认一次后，生成、校验、测试与构建将自动继续。</p>
    <div className="toolbar"><button disabled={!awaiting} onClick={() => setSelected(new Set(capabilities.map((capability) => capability.id)))}>全选</button><button disabled={!awaiting} onClick={() => setSelected(new Set())}>清空</button><button className="primary" disabled={saving || !project || !awaiting || !selected.size} onClick={() => void save()}>{saving ? "正在启动流水线…" : "确认并自动生成"}</button></div>
    <div className="curate-list">{capabilities.map((capability) => {
      const status = capability.realExecutable ? "实车就绪" : capability.mockExecutable ? "Mock 就绪 · 实车受阻" : "源码候选";
      return <label key={capability.id} className={selected.has(capability.id) ? "selected" : ""}><input type="checkbox" disabled={!awaiting} checked={selected.has(capability.id)} onChange={() => setSelected((current) => { const next = new Set(current); next.has(capability.id) ? next.delete(capability.id) : next.add(capability.id); return next; })} /><span><b>{capability.id}</b><small>{capability.sourceRef}</small>{capability.blockedReason && <small className="blocked-reason">{capability.blockedReason}</small>}</span><em>{status}</em></label>;
    })}</div>
  </section>;
}
