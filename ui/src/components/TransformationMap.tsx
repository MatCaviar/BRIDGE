import { useWorkbench } from "../state/workbench";

export function TransformationMap() {
  const { artifacts } = useWorkbench();
  const capabilities = (artifacts?.capabilities ?? []).filter((capability) => capability.selected).slice(0, 18);
  const tools = new Map((artifacts?.tools ?? []).map((tool) => [tool.name, tool]));
  return <section id="转换图" className="panel glass wide"><div className="panel-title"><div><p className="eyebrow">05 / PROVENANCE FIELD</p><h2>Source → Capability → MCP → RPC</h2></div><span className="metric">{artifacts?.edges.length ?? 0} edges</span></div><div className="map" role="img" aria-label="源码到 RPC 的转换溯源图"><div className="lane-head"><span>SOURCE</span><span>CAPABILITY</span><span>MCP TOOL</span><span>REAL TRANSPORT</span></div>{capabilities.map((capability) => {
    const tool = tools.get(capability.id);
    return <div className="map-row" key={capability.id}><code>{capability.sourceRef || "unknown"}</code><b>{capability.id}</b><span className={tool?.mockExecutable ? "linked" : "gap"}>{tool?.mockExecutable ? "MOCK READY" : "NOT BUILT"}</span><span className={tool?.realExecutable ? "linked" : "gap"}>{tool?.realExecutable ? "REAL READY" : tool?.blockedReason ?? "RPC mapping is missing"}</span></div>;
  })}{!capabilities.length && <p className="muted">选择能力后生成可追踪的转换链。</p>}</div></section>;
}
