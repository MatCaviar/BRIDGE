import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAdapter } from "./adapters/index.js";
import type { ServerConfig } from "./config.js";
import { registerHealthTool } from "@im/mcp-server-framework";
import { registerSoundstageTools } from "./tools/soundstage.js";
import { registerEqualizerTools } from "./tools/equalizer.js";
import { registerBeosonicTools } from "./tools/beosonic.js";
import { registerLocksoundTools } from "./tools/locksound.js";
import { registerKaraokeTools } from "./tools/karaoke.js";
import { registerVehicleTools } from "./tools/vehicle.js";
import { registerSystemTools } from "./tools/system.js";
import { registerLaunchTools } from "./tools/launch.js";

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "imaudio",
    version: "0.1.0",
  });

  const { adapter } = createAdapter(config);
  registerHealthTool(server);

  registerSoundstageTools(server, adapter);
  registerEqualizerTools(server, adapter);
  registerBeosonicTools(server, adapter);
  registerLocksoundTools(server, adapter);
  registerKaraokeTools(server, adapter);
  registerVehicleTools(server, adapter);
  registerSystemTools(server, adapter);
  registerLaunchTools(server, adapter);

  return server;
}
