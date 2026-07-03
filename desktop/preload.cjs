const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("bridge", {
  selectSourceDirectory: () => invoke("bridge:select-source"),
  selectSchemaFile: () => invoke("bridge:select-schema"),
  importProject: (request) => invoke("bridge:import", request),
  listProjects: () => invoke("bridge:list-projects"),
  getProject: (id) => invoke("bridge:get-project", id),
  getSourceIndex: (id) => invoke("bridge:get-source", id),
  getArtifacts: (id) => invoke("bridge:get-artifacts", id),
  saveSelection: (id, selected) => invoke("bridge:save-selection", id, selected),
  runStage: (id, stage, confirmation) => invoke("bridge:run-stage", id, stage, confirmation),
  getMcp: (id) => invoke("bridge:get-mcp", id),
  startMcp: (id, mode, confirmation) => invoke("bridge:start-mcp", id, mode, confirmation),
  stopMcp: (id, confirmation) => invoke("bridge:stop-mcp", id, confirmation),
  callMcp: (id, toolName, args, mode, confirmation) => invoke("bridge:call-mcp", id, toolName, args, mode, confirmation),
  subscribeProjectEvents: async (projectId, listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on("bridge:event", handler);
    await invoke("bridge:subscribe", projectId);
    return () => ipcRenderer.removeListener("bridge:event", handler);
  },
});
