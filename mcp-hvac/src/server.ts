import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAdapter } from "./adapters/index.js";
import type { ServerConfig } from "./config.js";
import { createSafetyGuard, registerHealthTool } from "@im/mcp-server-framework";
import { TOOL_REGISTRY } from "./tools/registry.js";

function createSafetyBridge(adapter: import("./adapters/types.js").IAdapter) {
  const dyn = adapter as unknown as Record<string, unknown>;
  return {
    getGearStatus: () => {
      if (typeof dyn.readGearStatus === "function") {
        return (dyn.readGearStatus as () => Promise<{ isParked: boolean; ignoreMode: boolean }>)();
      }
      return Promise.resolve({ isParked: true, ignoreMode: false });
    },
    getHotspotInfo: () => {
      if (typeof dyn.getHotspotInfo === "function") {
        return (dyn.getHotspotInfo as () => Promise<{ ssid: string | null }>)();
      }
      return Promise.resolve({ ssid: null });
    },
  };
}
import { registerClimateTools } from "./tools/climate.js";
import { registerWindowTools } from "./tools/window.js";
import { registerSensorTools } from "./tools/sensor.js";
import { registerSeatTools } from "./tools/seat.js";

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "hvac",
    version: "0.1.0",
  });

  const { adapter } = createAdapter(config);
  registerHealthTool(server);

  const guard = createSafetyGuard(createSafetyBridge(adapter));
  const registryEntries = Object.fromEntries(
    TOOL_REGISTRY.map(e => [e.id, e.safetyLevel]),
  );

  registerClimateTools(server, adapter, guard, registryEntries);
  registerWindowTools(server, adapter, guard, registryEntries);
  registerSensorTools(server, adapter, guard, registryEntries);
  registerSeatTools(server, adapter, guard, registryEntries);

  return server;
}
