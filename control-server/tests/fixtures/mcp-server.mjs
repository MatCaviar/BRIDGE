import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "bridge-test", version: "1.0.0" });
server.registerTool("echo", { description: "Echo text", inputSchema: { text: z.string() } }, async ({ text }) => ({ content: [{ type: "text", text }] }));
server.registerTool("wait", { description: "Wait", inputSchema: { milliseconds: z.number() } }, async ({ milliseconds }) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
  return { content: [{ type: "text", text: "done" }] };
});
await server.connect(new StdioServerTransport());
