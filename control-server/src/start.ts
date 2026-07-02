import { createConfig } from "./config.js";
import { createWorkbenchServer } from "./server.js";

const config = createConfig();
createWorkbenchServer({ config }).listen(config.port, config.host, () => {
  process.stdout.write(`BRIDGE Workbench API http://${config.host}:${config.port}\n`);
});
