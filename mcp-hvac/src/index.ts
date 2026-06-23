import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { registerGracefulShutdown } from "./shutdown.js";
import { readConfig } from "./config.js";

async function main(): Promise<void> {
  const config = readConfig();
  const server = createServer(config);
  registerGracefulShutdown(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[mcp-server] Connected via stdio transport\n");
}

main().catch((error) => {
  process.stderr.write(`[mcp-server] Fatal: ${error}\n`);
  process.exit(1);
});
