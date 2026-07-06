import { useMemo, useState } from "react";
import { useWorkbench } from "../state/workbench";

export function SourceExplorer() {
  const { source, sourceEdges, sourceEvidence, sourceFindings } = useWorkbench();
  const [query, setQuery] = useState("");
  const declarations = source.filter((node) => node.kind === "symbol");
  const shown = useMemo(() => source.filter((node) => `${node.path} ${node.owner ?? ""} ${node.label}`.toLowerCase().includes(query.toLowerCase())).slice(0, 500), [source, query]);
  const evidence = sourceEvidence.filter((item) => `${item.operation} ${item.path}`.toLowerCase().includes(query.toLowerCase())).slice(0, 100);
  const dependencies = sourceEdges.filter((edge) => edge.kind === "imports");
  return <section id="源码" className="panel glass">
    <div className="panel-title"><div><p className="eyebrow">02 / 源码图谱</p><h2>代码结构</h2></div><span className="metric">{declarations.length} 个声明</span></div>
    <div className="chips source-summary"><span>{dependencies.length} 个依赖</span><span>{sourceEvidence.length} 条 RPC 证据</span></div>
    <input className="search" aria-label="搜索源码" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="过滤文件、声明或 RPC…" />
    <div className="tree" role="tree">{shown.map((node) => <button role="treeitem" key={node.id} className={`tree-node ${node.kind}`} style={{ paddingLeft: `${12 + (node.path.split("/").length - 1) * 14}px` }}><span>{node.kind === "directory" ? "◇" : node.kind === "file" ? "▱" : "·"}</span><b>{node.owner ? `${node.owner}.${node.label}` : node.label}</b><small>{node.symbolKind ? `${node.symbolKind}${node.line ? ` · L${node.line}` : ""}` : node.path}</small></button>)}</div>
    {evidence.length > 0 && <div className="evidence-list">{evidence.map((item) => <code key={item.id}>{item.operation} · {item.transport.toUpperCase()} RPC <small>{item.path}:L{item.line}</small></code>)}</div>}
    {sourceFindings.map((finding) => <p className="muted" key={finding}>{finding}</p>)}
  </section>;
}
