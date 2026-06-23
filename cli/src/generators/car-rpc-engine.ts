import type { AnalysisData } from "../types.js";
import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 车机 agil 引擎模板（打包资产，自包含；所有 app 相同）。
const RPC_ENGINE_TS = readFileSync(resolve(__dirname, "../../assets/car-rpc-engine.ts.template"), "utf-8");

export function generateCarRpcEngine(analysis: AnalysisData): Map<string, string> {
  const appName = analysis.app.name;
  const manifestPage = {
    uri: `page://${appName}.yunos.com/rpcagent`,
    content_path: "src/RpcEngine.js",
    main: false,
    capabilities: { ui: { engine: "agil", display: "disp_host0" } },
    extension: {},
  };
  const result = new Map<string, string>();
  result.set("car-side/RpcEngine.ts", RPC_ENGINE_TS);
  result.set("car-side/manifest-page.json", JSON.stringify(manifestPage, null, 2) + "\n");
  return result;
}
