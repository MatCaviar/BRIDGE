import { pipelineStages } from "@bridge/workbench-contracts";
import { useWorkbench } from "../state/workbench";

const STAGE_STATUS_LABEL: Record<string, string> = { pending: "待运行", running: "运行中", passed: "已通过", failed: "已失败" };
const PIPELINE_STATUS_LABEL: Record<string, string> = { idle: "空闲", analyzing: "分析中", running: "运行中", awaiting_curate: "等待筛选", mock_ready: "Mock 就绪", failed: "已失败" };

export function PipelineCanvas() {
  const { artifacts, events, pipelineRun } = useWorkbench();
  const latest = new Map<string, string>((artifacts?.stages ?? []).map((stage) => [stage.id, stage.status]));
  for (const event of events) if (event.type === "stage") latest.set(String(event.payload.stage), String(event.payload.status));
  const active = pipelineRun?.activeStage;
  const statusText = pipelineRun?.status ? (PIPELINE_STATUS_LABEL[pipelineRun.status] ?? pipelineRun.status) : "空闲";
  return <section id="流水线" className="panel glass wide"><div className="panel-title"><div><p className="eyebrow">06 / 流水线</p><h2>自动流水线轨道</h2></div><span className="metric">{statusText}</span></div><div className="pipeline">{pipelineStages.map((stage, index) => { const status = latest.get(stage.id) ?? "pending"; return <div key={stage.id} className={`stage ${status} ${active === stage.id ? "active" : ""}`}><span>{String(index + 1).padStart(2, "0")}</span><b>{stage.label}</b><small>{active === stage.id ? "运行中" : STAGE_STATUS_LABEL[status] ?? status}</small></div>; })}</div></section>;
}
