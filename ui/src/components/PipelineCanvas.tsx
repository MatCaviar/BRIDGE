import { useState } from "react";
import { pipelineStages, safeProjectId } from "@bridge/workbench-contracts";
import { useWorkbench } from "../state/workbench";

const STAGE_STATUS_LABEL: Record<string, string> = { pending: "待运行", running: "运行中", passed: "已通过", failed: "已失败" };
const PIPELINE_STATUS_LABEL: Record<string, string> = { idle: "空闲", analyzing: "分析中", running: "运行中", awaiting_curate: "等待筛选", mock_ready: "Mock 就绪", failed: "已失败" };

/** Strip the last path segment without node:path (the UI runs in the browser). Used only to display
 *  the deploy target — the server computes the real path from the persisted originalSourcePath. */
function parentDir(p: string): string { return p.replace(/[\\/][^\\/]*$/, "") || p; }

export function PipelineCanvas() {
  const { artifacts, events, pipelineRun, project, runStage, busy } = useWorkbench();
  const latest = new Map<string, string>((artifacts?.stages ?? []).map((stage) => [stage.id, stage.status]));
  for (const event of events) if (event.type === "stage") latest.set(String(event.payload.stage), String(event.payload.status));
  const active = pipelineRun?.activeStage;
  const statusText = pipelineRun?.status ? (PIPELINE_STATUS_LABEL[pipelineRun.status] ?? pipelineRun.status) : "空闲";
  const done = pipelineRun?.status === "mock_ready";
  const originalSource = project?.originalSourcePath;
  const deployTarget = originalSource && project ? `${parentDir(originalSource)}/mcp-${safeProjectId(project.name)}` : undefined;
  const deployStatus = latest.get("deploy") ?? "pending";
  const verifyPassed = latest.get("verify") === "passed";
  const deployed = deployStatus === "passed";
  const deploying = busy === "deploy";
  const [typed, setTyped] = useState("");
  const canDeploy = !!deployTarget && verifyPassed && !deploying && typed === project?.name;
  return (
    <section id="流水线" className="panel glass wide">
      <div className="panel-title"><div><p className="eyebrow">06 / 流水线</p><h2>自动流水线轨道</h2></div><span className="metric">{statusText}</span></div>
      {done ? (
        <div className="pipeline-done">
          <p className="pipeline-done-title">✅ 流水线已完成</p>
          <p>完整的生成 schema 见「机器可读产物 → 工具」tab。</p>
          <p>MCP server 可在「MCP 调试」面板查看。</p>
          <p>运行时产物文件夹：<code>{project?.root ?? "(未知)"}</code></p>
          {deployed && deployTarget ? <p>已导出到源码同级目录：<code>{deployTarget}</code></p> : null}
        </div>
      ) : null}
      <div className="pipeline">{pipelineStages.map((stage, index) => { const status = latest.get(stage.id) ?? "pending"; return <div key={stage.id} className={`stage ${status} ${active === stage.id ? "active" : ""}`}><span>{String(index + 1).padStart(2, "0")}</span><b>{stage.label}</b><small>{active === stage.id ? "运行中" : STAGE_STATUS_LABEL[status] ?? status}</small></div>; })}</div>
      {deployTarget ? (
        <div className="deploy-panel">
          <p className="eyebrow">导出产物到源码同级目录</p>
          <p className="muted">把生成的 <code>mcp-{project ? safeProjectId(project.name) : ""}</code> 复制到 <code>{parentDir(originalSource!)}</code>（源码同级），与无可视化版本的产物布局一致。</p>
          {deployed ? (
            <p className="deploy-ok">✅ 已导出到 <code>{deployTarget}</code></p>
          ) : (
            <div className="deploy-controls">
              <label>输入项目名 <b>{project?.name}</b> 以确认导出<input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={project?.name} disabled={deploying} /></label>
              <button className="primary" disabled={!canDeploy} onClick={() => project && void runStage("deploy", { typedConfirmation: project.name })}>{deploying ? "导出中…" : verifyPassed ? "导出产物" : "需先通过验证 (verify)"}</button>
              {!verifyPassed ? <small className="muted">verify 通过后即可导出。</small> : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
