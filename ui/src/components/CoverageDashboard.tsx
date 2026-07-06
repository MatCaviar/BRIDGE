import { useWorkbench } from "../state/workbench";

const COVERAGE_LABEL: Record<string, string> = { discovered: "已发现", selected: "已选择", projected: "已投影", wired: "已接线" };

export function CoverageDashboard() {
  const { artifacts } = useWorkbench();
  const sourceCoverage = { discovered: artifacts?.coverage.discovered ?? 0, selected: artifacts?.coverage.selected ?? 0, projected: artifacts?.coverage.projected ?? 0, wired: artifacts?.coverage.wired ?? 0 };
  const max = Math.max(1, sourceCoverage.discovered);
  return <section className="panel glass"><div className="panel-title"><div><p className="eyebrow">源码覆盖</p><h2>源码转换覆盖</h2></div></div><div className="coverage">{Object.entries(sourceCoverage).map(([label, value]) => <div key={label}><span><b>{COVERAGE_LABEL[label] ?? label}</b><strong>{value}</strong></span><i><em style={{ width: `${value / max * 100}%` }} /></i></div>)}</div></section>;
}
