/**
 * MCP-related type definitions for the gateway.
 *
 * These types model the configuration and tool metadata exchanged between
 * the gateway and upstream MCP servers.
 */

/** Configuration for a single MCP server connection. */
export interface McpServerConfig {
  /** Human-readable server identifier (used as prefix for qualified tool names). */
  readonly name: string;

  /** Transport mechanism — currently only stdio is supported. */
  readonly transport: "stdio" | "sse";

  /** Command to spawn the server process (stdio transport). */
  readonly command?: string;

  /** Arguments passed to the spawned process (stdio transport). */
  readonly args?: string[];

  /** Working directory for the spawned server; relative values resolve from the config file. */
  readonly cwd?: string;

  /** Additional environment variables for the spawned server. */
  readonly env?: Readonly<Record<string, string>>;

  /** Server URL (sse transport). */
  readonly url?: string;
}

/** A tool definition discovered from a connected MCP server. */
export interface McpToolDef {
  /** Name of the source MCP server. */
  readonly serverName: string;

  /** Original tool name as reported by the server (no prefix). */
  readonly name: string;

  /** Fully qualified name: "serverName.toolName". */
  readonly qualifiedName: string;

  /** Human-readable tool description. */
  readonly description: string;

  /** JSON Schema describing the tool's input parameters. */
  readonly inputSchema: Record<string, unknown>;
}
