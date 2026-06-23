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
import { registerNavigationTools } from "./tools/navigation.js";
import { registerPetTools } from "./tools/pet.js";
import { registerVehicleTools } from "./tools/vehicle.js";
import { registerTransferTools } from "./tools/transfer.js";
import { registerSystemTools } from "./tools/system.js";

export function createServer(config: ServerConfig): McpServer {
  const server = new McpServer({
    name: "aipet",
    version: "0.1.0",
  });

  const { adapter } = createAdapter(config);
  registerHealthTool(server);

  const guard = createSafetyGuard(createSafetyBridge(adapter));
  const registryEntries = Object.fromEntries(
    TOOL_REGISTRY.map(e => [e.id, e.safetyLevel]),
  );

  registerNavigationTools(server, adapter, guard, registryEntries);
  registerPetTools(server, adapter, guard, registryEntries);
  registerVehicleTools(server, adapter, guard, registryEntries);
  registerTransferTools(server, adapter, guard, registryEntries);
  registerSystemTools(server, adapter, guard, registryEntries);

  return server;
}
