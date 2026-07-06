import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "bridge-test", version: "1.0.0" });
server.registerTool("echo", { description: "Echo text", inputSchema: { text: z.string() } }, async ({ text }) => ({ content: [{ type: "text", text }] }));
server.registerTool("wait", { description: "Wait", inputSchema: { milliseconds: z.number() } }, async ({ milliseconds }) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  return { content: [{ type: "text", text: "done" }] };
});
// Exposes the spawned server's env so tests can assert the launcher set ELECTRON_RUN_AS_NODE=1
// (without it, electron.exe never answers the MCP initialize handshake and start times out).
server.registerTool("env", { description: "Echo an env var", inputSchema: { name: z.string() } }, async ({ name }) => ({ content: [{ type: "text", text: process.env[name] ?? "" }] }));
await server.connect(new StdioServerTransport());
