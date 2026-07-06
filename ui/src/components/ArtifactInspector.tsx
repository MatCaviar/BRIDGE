import { useState } from "react";
import { useWorkbench } from "../state/workbench";

type Tab = "capabilities" | "tools" | "rpc" | "findings";
const TAB_LABELS: Record<Tab, string> = { capabilities: "能力", tools: "工具", rpc: "RPC", findings: "发现" };

export function ArtifactInspector() {
  const { artifacts } = useWorkbench();
  const [tab, setTab] = useState<Tab>("capabilities");
  const [selectedRpc, setSelectedRpc] = useState(0);

  const rpcFiles = artifacts?.rpcFiles ?? [];
  const rpcIndex = Math.min(selectedRpc, Math.max(0, rpcFiles.length - 1));
  const activeRpc = rpcFiles[rpcIndex];
  const findings = artifacts?.findings ?? [];

  return (
    <section className="panel glass">
      <div className="panel-title"><div><p className="eyebrow">产物检视</p><h2>机器可读产物</h2></div></div>
      <div className="tabs">{(["capabilities", "tools", "rpc", "findings"] as const).map((item) => (
        <button className={tab === item ? "active" : ""} onClick={() => setTab(item)} key={item}>{TAB_LABELS[item]}</button>
      ))}</div>
      {tab === "rpc" ? (
        rpcFiles.length === 0 ? (
          <div className="artifact empty">尚未生成 RPC 文件（流水线未运行到 scaffold/build，或未生成 rpc 目录）</div>
        ) : (
          <div className="rpc-browser">
            <ul className="rpc-files">
              {rpcFiles.map((file, index) => (
                <li key={`${file.kind}/${file.name}`}>
                  <button className={index === rpcIndex ? "active" : ""} onClick={() => setSelectedRpc(index)} title={`${file.bytes} 字节`}>
                    <span className={`kind ${file.kind}`}>{file.kind}</span>{file.name}
                  </button>
                </li>
              ))}
            </ul>
            <pre className="artifact rpc-code"><code>{activeRpc?.content ?? ""}</code></pre>
          </div>
        )
      ) : tab === "findings" ? (
        findings.length === 0 ? (
          <div className="artifact empty">未发现问题</div>
        ) : (
          <ul className="findings">{findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul>
        )
      ) : (
        <pre className="artifact"><code>{JSON.stringify(tab === "capabilities" ? artifacts?.capabilities : artifacts?.tools, null, 2)}</code></pre>
      )}
    </section>
  );
}
