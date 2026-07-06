import { useWorkbench } from "../state/workbench";

export function TransformationMap() {
  const { artifacts } = useWorkbench();
  const capabilities = (artifacts?.capabilities ?? []).filter((capability) => capability.selected).slice(0, 18);
  const tools = new Map((artifacts?.tools ?? []).map((tool) => [tool.name, tool]));
  return <section id="转换图" className="panel glass wide"><div className="panel-title"><div><p className="eyebrow">05 / 溯源场</p><h2>源码 → 能力 → MCP → RPC</h2></div><span className="metric">{artifacts?.edges.length ?? 0} 条边</span></div><div className="map" role="img" aria-label="源码到 RPC 的转换溯源图"><div className="lane-head"><span>源码</span><span>能力</span><span>MCP 工具</span><span>实车通道</span></div>{capabilities.map((capability) => {
    const tool = tools.get(capability.id);
    return <div className="map-row" key={capability.id}><code>{capability.sourceRef || "未知"}</code><b>{capability.id}</b><span className={tool?.mockExecutable ? "linked" : "gap"}>{tool?.mockExecutable ? "Mock 就绪" : "未构建"}</span><span className={tool?.realExecutable ? "linked" : "gap"}>{tool?.realExecutable ? "实车就绪" : tool?.blockedReason ?? "缺少 RPC 映射"}</span></div>;
  })}{!capabilities.length && <p className="muted">选择能力后生成可追踪的转换链。</p>}</div></section>;
}
