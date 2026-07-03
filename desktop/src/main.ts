import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { resolve } from "node:path";
import { createConfig } from "@bridge/control-server/config";
import { WorkbenchService } from "@bridge/control-server/service";
import { registerWorkbenchIpc } from "./register-ipc.js";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const service = new WorkbenchService(createConfig({ runtimeRoot: resolve(repositoryRoot, ".workbench-runtime"), repositoryRoot }));
let cleanupIpc: (() => void) | undefined;

async function createWindow(): Promise<BrowserWindow> {
  await service.ready();
  cleanupIpc ??= registerWorkbenchIpc({ ipcMain, dialog, service });
  const window = new BrowserWindow({
    width: 1480, height: 960, minWidth: 1080, minHeight: 720, backgroundColor: "#09090b", show: false,
    webPreferences: { preload: resolve(repositoryRoot, "desktop", "preload.cjs"), nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  window.once("ready-to-show", () => window.show());
  await window.loadFile(resolve(repositoryRoot, "ui", "dist", "index.html"));
  return window;
}

app.whenReady().then(async () => { await createWindow(); app.on("activate", async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow(); }); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => { cleanupIpc?.(); void service.shutdown(); });
