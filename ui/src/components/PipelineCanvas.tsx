import { pipelineStages } from "@bridge/workbench-contracts";
import { useWorkbench } from "../state/workbench";

export function PipelineCanvas() {
  const { artifacts, events, pipelineRun } = useWorkbench();
  const latest = new Map<string, string>((artifacts?.stages ?? []).map((stage) => [stage.id, stage.status]));
  for (const event of events) if (event.type === "stage") latest.set(String(event.payload.stage), String(event.payload.status));
  const active = pipelineRun?.activeStage;
  return <section id="Pipeline" className="panel glass wide"><div className="panel-title"><div><p className="eyebrow">06 / BRIDGE PIPELINE</p><h2>自动流水线轨道</h2></div><span className="metric">{pipelineRun?.status ?? "IDLE"}</span></div><div className="pipeline">{pipelineStages.map((stage, index) => { const status = latest.get(stage.id) ?? "pending"; return <div key={stage.id} className={`stage ${status} ${active === stage.id ? "active" : ""}`}><span>{String(index + 1).padStart(2, "0")}</span><b>{stage.label}</b><small>{active === stage.id ? "running" : status}</small></div>; })}</div></section>;
}
