import { useEffect, useState } from "react";
import { workbenchApi } from "../bridge/client";
import { useWorkbench } from "../state/workbench";

export function ProjectImport() {
  const { setProject, setError, project, resetProject, busy: workbenchBusy, initialSource } = useWorkbench();
  const [name, setName] = useState("");
  const [sourceDirectory, setSourceDirectory] = useState("");
  const [schemaPath, setSchemaPath] = useState("");
  const [busy, setBusy] = useState(false);
  // When launched via `/im-mcp-codeagent:mcp-pipeline <path>`, pre-fill the source directory.
  useEffect(() => { if (initialSource) setSourceDirectory(initialSource); }, [initialSource]);
  const selectSource = async () => { try { const value = await workbenchApi.selectSourceDirectory(); if (value) setSourceDirectory(value); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } };
  const selectSchema = async () => { try { const value = await workbenchApi.selectSchemaFile(); if (value) setSchemaPath(value); } catch (error) { setError(error instanceof Error ? error.message : String(error)); } };
  const submit = async () => {
    if (!name || !sourceDirectory || !schemaPath) return setError("请选择源码目录、格式参考 Schema，并填写项目名称");
    setBusy(true); setError(undefined);
    try { setProject(await workbenchApi.importProject({ projectName: name, sourceDirectory, schemaPath })); }
    catch (error) { setError(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  return <section id="导入" className="panel glass"><div className="panel-title"><div><p className="eyebrow">01 / 导入</p><h2>源码与输出格式参考</h2></div><span className="metric">本地 IPC</span></div><div className="import-grid">
    <label>项目名<input value={name} onChange={(event) => setName(event.target.value)} placeholder="mock-audio" /></label>
    <div className="file-drop"><button onClick={() => void selectSource()}>选择源码目录</button><small>{sourceDirectory || "候选接口将只从这里发现"}</small></div>
    <div className="file-drop"><button onClick={() => void selectSchema()}>选择格式参考 Schema</button><small>{schemaPath || "示例工具仅作为格式参考，不会成为候选"}</small></div>
    <button className="primary" disabled={busy} onClick={() => void submit()}>{busy ? "正在导入并启动分析…" : "导入并自动分析"}</button>
    {project && <button className="danger" disabled={!!workbenchBusy} onClick={() => void resetProject()}>{workbenchBusy === "reset" ? "正在重置…" : "重置当前项目状态"}</button>}
  </div></section>;
}
