import { useWorkbench } from "../state/workbench";

const STATUS_LABEL: Record<string, string> = { idle: "空闲", analyzing: "分析中", running: "运行中", awaiting_curate: "等待筛选", mock_ready: "Mock 就绪", failed: "已失败" };

export function CommandCenter() {
  const { project, pipelineRun, retryPipeline, cancelPipeline } = useWorkbench();
  const running = pipelineRun?.status === "analyzing" || pipelineRun?.status === "running";
  const statusText = pipelineRun?.status ? (STATUS_LABEL[pipelineRun.status] ?? pipelineRun.status) : "空闲";
  return <section className="panel glass"><div className="panel-title"><div><p className="eyebrow">自动控制</p><h2>自动流水线</h2></div><span className="metric">{statusText}</span></div>
    <div className="command-form">
      <p className="muted">{pipelineRun?.status === "awaiting_curate" ? "分析完成，等待确认筛选接口。" : pipelineRun?.status === "mock_ready" ? "生成套件已构建并通过本地验证。" : pipelineRun?.error ?? "导入源码后将自动开始分析。"}</p>
      {pipelineRun?.activeStage && <p>当前阶段：<b>{pipelineRun.activeStage}</b></p>}
      {pipelineRun?.status === "failed" && pipelineRun.failedStage && <button className="primary" disabled={!project} onClick={() => void retryPipeline()}>从 {pipelineRun.failedStage} 重试</button>}
      {running && <button disabled={!project} onClick={() => void cancelPipeline()}>取消当前流水线</button>}
    </div>
  </section>;
}
