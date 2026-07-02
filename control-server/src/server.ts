import { createServer, type Server } from "node:http";
import { createConfig, type ControlServerConfig } from "./config.js";
import { WorkbenchRouter } from "./http/router.js";

export function createWorkbenchServer(options: { readonly config?: ControlServerConfig } = {}): Server {
  const config = options.config ?? createConfig();
  if (config.host !== "127.0.0.1") throw new Error("Control server must bind to the IPv4 loopback host");
  const router = new WorkbenchRouter(config);
  return createServer((request, response) => void router.handle(request, response));
}

const isEntry = process.argv[1] && new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)).replaceAll("/", "\\").toLowerCase() === process.argv[1].toLowerCase();
if (isEntry) {
  const config = createConfig();
  createWorkbenchServer({ config }).listen(config.port, config.host, () => process.stdout.write(`BRIDGE Workbench API http://${config.host}:${config.port}\n`));
}
