/**
 * McpConnector — connects to MCP servers, discovers tools, and executes calls.
 *
 * Design choices:
 *   - Ephemeral connections: each operation opens a fresh client, performs its
 *     work, then tears down. This avoids managing long-lived connection state
 *     and keeps the implementation simple.
 *   - All logging goes to stderr so that stdout remains reserved for the MCP
 *     JSON-RPC protocol when the gateway itself runs as a stdio server.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig, McpToolDef } from "./types.js";

/** Result shape returned by MCP `callTool`. */
interface McpToolResultContent {
  readonly type: string;
  readonly text?: string;
}

/**
 * Connector that bridges the gateway to one or more MCP servers.
 *
 * Typical lifecycle:
 *   1. Construct with server configs.
 *   2. `connectAll()` to discover available tools.
 *   3. `executeTool()` / `fetchPrompt()` to invoke operations.
 *   4. `disconnect()` to clean up.
 */
export class McpConnector {
  private readonly serverConfigs: readonly McpServerConfig[];
  private readonly tools: Map<string, McpToolDef> = new Map();

  constructor(serverConfigs: readonly McpServerConfig[]) {
    this.serverConfigs = Object.freeze([...serverConfigs]);
  }

  // ---------------------------------------------------------------------------
  // Connection & discovery
  // ---------------------------------------------------------------------------

  /**
   * Connect to every configured MCP server and collect their tool definitions.
   *
   * Errors from individual servers are logged but do not prevent other servers
   * from being contacted — a partial result is better than no result.
   */
  async connectAll(): Promise<void> {
    for (const config of this.serverConfigs) {
      try {
        const serverTools = await this.discoverTools(config);
        for (const tool of serverTools) {
          this.tools.set(tool.qualifiedName, tool);
        }

        const count = serverTools.length;
        process.stderr.write(
          `[mcp-connector] Connected to "${config.name}" — discovered ${count} tool(s)\n`,
        );
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[mcp-connector] Failed to connect to "${config.name}": ${message}\n`,
        );
      }
    }
  }

  /**
   * Return all tool definitions collected during `connectAll()`.
   *
   * Returns a new array on every call to preserve immutability.
   */
  getToolDefinitions(): McpToolDef[] {
    return Array.from(this.tools.values());
  }

  // ---------------------------------------------------------------------------
  // Tool execution
  // ---------------------------------------------------------------------------

  /**
   * Execute a tool on the specified server and return the text result.
   *
   * @param serverName - The server identifier (from config `name`).
   * @param toolName   - The original tool name (without server prefix).
   * @param args       - Arguments to pass to the tool.
   * @returns The aggregated text content from the tool result, or `null` if
   *          the server is not configured.
   */
  async executeTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    const config = this.findConfig(serverName);
    if (!config) {
      throw new Error(`No MCP server configured with name "${serverName}"`);
    }

    const client = await this.createEphemeralClient(config);
    try {
      process.stderr.write(
        `[mcp-connector] Executing tool "${toolName}" on server "${serverName}"\n`,
      );

      const result = await client.callTool({ name: toolName, arguments: args });

      // Extract text content from the MCP result envelope
      const content = result.content as
        | McpToolResultContent[]
        | undefined
        | null;
      if (!content || !Array.isArray(content)) {
        return null;
      }

      const textParts = content
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text as string);

      return textParts.length > 0 ? textParts.join("\n") : null;
    } finally {
      await this.closeClient(client, serverName);
    }
  }

  // ---------------------------------------------------------------------------
  // Prompt fetching
  // ---------------------------------------------------------------------------

  /**
   * Fetch a named prompt from any connected MCP server.
   *
   * Iterates through configured servers and returns the first match. Returns
   * `null` if no server exposes the requested prompt.
   */
  async fetchPrompt(promptName: string): Promise<string | null> {
    for (const config of this.serverConfigs) {
      try {
        const client = await this.createEphemeralClient(config);
        try {
          const promptsResult = await client.listPrompts();
          const promptList = promptsResult?.prompts ?? [];

          const match = promptList.find(
            (p: { name: string }) => p.name === promptName,
          );
          if (!match) {
            continue;
          }

          const promptResult = await client.getPrompt({ name: promptName, arguments: {} });
          const messages = promptResult?.messages ?? [];

          const textParts = messages
            .filter(
              (m: { content?: { type?: string } }) =>
                m.content?.type === "text",
            )
            .map(
              (m: { content: { type: string; text?: string } }) =>
                (m.content as { type: string; text: string }).text,
            );

          if (textParts.length > 0) {
            process.stderr.write(
              `[mcp-connector] Fetched prompt "${promptName}" from server "${config.name}"\n`,
            );
            return textParts.join("\n");
          }
        } finally {
          await this.closeClient(client, config.name);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(
          `[mcp-connector] Error fetching prompt "${promptName}" from "${config.name}": ${message}\n`,
        );
      }
    }

    process.stderr.write(
      `[mcp-connector] Prompt "${promptName}" not found on any server\n`,
    );
    return null;
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  /**
   * Disconnect all stored tool references.
   *
   * Because connections are ephemeral, there are no persistent transports to
   * close — this simply clears the internal tool registry.
   */
  async disconnect(): Promise<void> {
    this.tools.clear();
    process.stderr.write("[mcp-connector] Disconnected — tool registry cleared\n");
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Discover tools from a single MCP server. */
  private async discoverTools(
    config: McpServerConfig,
  ): Promise<readonly McpToolDef[]> {
    const client = await this.createEphemeralClient(config);
    try {
      const result = await client.listTools();
      const rawTools = result?.tools ?? [];

      return rawTools.map(
        (tool: { name: string; description?: string; inputSchema?: Record<string, unknown> }) => {
          const qualifiedName = `${config.name}.${tool.name}`;
          return Object.freeze({
            serverName: config.name,
            name: tool.name,
            qualifiedName,
            description: tool.description ?? "",
            inputSchema: tool.inputSchema ?? { type: "object", properties: {} },
          }) satisfies McpToolDef;
        },
      );
    } finally {
      await this.closeClient(client, config.name);
    }
  }

  /** Create a short-lived MCP client connected to the given server. */
  private async createEphemeralClient(
    config: McpServerConfig,
  ): Promise<Client> {
    if (config.transport !== "stdio") {
      throw new Error(
        `Unsupported transport "${config.transport}" for server "${config.name}" — only stdio is implemented`,
      );
    }

    if (!config.command) {
      throw new Error(
        `Missing "command" for stdio transport on server "${config.name}"`,
      );
    }

    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
    });

    const client = new Client(
      { name: "mcp-gateway", version: "1.0.0" },
      { capabilities: {} },
    );

    await client.connect(transport);
    return client;
  }

  /** Safely close an ephemeral client. */
  private async closeClient(client: Client, serverName: string): Promise<void> {
    try {
      await client.close();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[mcp-connector] Error closing client for "${serverName}": ${message}\n`,
      );
    }
  }

  /** Look up a server config by name. */
  private findConfig(serverName: string): McpServerConfig | undefined {
    return this.serverConfigs.find((c) => c.name === serverName);
  }
}
