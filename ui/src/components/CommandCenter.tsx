import { useWorkbench } from "../state/workbench";

export function CommandCenter() {
  const { project, pipelineRun, retryPipeline, cancelPipeline } = useWorkbench();
  const running = pipelineRun?.status === "analyzing" || pipelineRun?.status === "running";
  return <section className="panel glass"><div className="panel-title"><div><p className="eyebrow">AUTOMATION CONTROL</p><h2>自动流水线</h2></div><span className="metric">{pipelineRun?.status ?? "IDLE"}</span></div>
    <div className="command-form">
      <p className="muted">{pipelineRun?.status === "awaiting_curate" ? "分析完成，正在等待 Curate 选择。" : pipelineRun?.status === "mock_ready" ? "生成套件已构建并通过本地验证。" : pipelineRun?.error ?? "导入源码后将自动开始 Analyze。"}</p>
      {pipelineRun?.activeStage && <p>当前阶段：<b>{pipelineRun.activeStage}</b></p>}
      {pipelineRun?.status === "failed" && pipelineRun.failedStage && <button className="primary" disabled={!project} onClick={() => void retryPipeline()}>从 {pipelineRun.failedStage} 重试</button>}
      {running && <button disabled={!project} onClick={() => void cancelPipeline()}>取消当前流水线</button>}
    </div>
  </section>;
}
