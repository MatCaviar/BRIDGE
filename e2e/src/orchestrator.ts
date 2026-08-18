/**
 * Orchestrator — core execution loop connecting LLM to MCP tools.
 *
 * Pattern: LLM call → extract tool calls → execute via MCP → feed results back → repeat.
 * Reference: Z-AXIS v3.0 orchestrator.py, simplified.
 */
import type { LLMClient, Message } from "./llm/types.js";
import type { GatewayConfig } from "./config.js";
import { McpConnector } from "./mcp/connector.js";
import { convertSchemas } from "./mcp/schema-convert.js";
import * as logger from "./utils/logger.js";

const MAX_CONTENT_PREVIEW = 300;

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen) + "...";
}

/**
 * Run the orchestration loop.
 *
 * @param llm      - The LLM client (Anthropic, OpenAI, etc.)
 * @param connector - The MCP connector (already connected)
 * @param config   - Gateway configuration
 * @returns The final text response from the LLM
 */
export async function run(
  llm: LLMClient,
  connector: McpConnector,
  config: GatewayConfig,
): Promise<string> {
  // ── Phase 1: Prepare tools ──

  const toolDefs = connector.getToolDefinitions();
  logger.info("orchestrator", `Discovered ${toolDefs.length} tools`);

  if (toolDefs.length === 0) {
    throw new Error("No MCP tools discovered — check server configuration");
  }

  const llmTools = convertSchemas(toolDefs, config.llm.provider);
  logger.info("orchestrator", `Converted ${llmTools.length} tool schemas for ${config.llm.provider}`);

  // System prompt: config override → MCP server prompt → fallback
  let systemPrompt: string;
  if (config.task.systemPrompt !== null) {
    systemPrompt = config.task.systemPrompt;
  } else {
    const fetched = await connector.fetchPrompt("aipet-guide");
    systemPrompt = fetched ?? "You are a helpful assistant with access to tools. Use them to help the user.";
  }
  logger.info("orchestrator", `System prompt: ${truncate(systemPrompt, 100)}...`);

  // ── Phase 2: Execution loop ──

  const messages: Message[] = [
    { role: "user", content: config.task.userMessage },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let turn = 0; turn < config.task.maxTurns; turn++) {
    logger.info("orchestrator", `--- Turn ${turn + 1}/${config.task.maxTurns} ---`);

    const response = await llm.createMessage({
      systemPrompt,
      messages,
      tools: llmTools,
    });

    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    // No tool calls → final answer
    if (response.toolCalls.length === 0) {
      logger.info(
        "orchestrator",
        `Complete after ${turn + 1} turns (tokens: ${totalInputTokens}in + ${totalOutputTokens}out)`,
      );
      return response.text;
    }

    // Add assistant response to history
    messages.push({
      role: "assistant",
      content: response.text,
      toolCalls: response.toolCalls,
    });

    // ── Phase 3: Execute tool calls ──

    for (const call of response.toolCalls) {
      logger.info(
        "orchestrator",
        `Tool call: ${call.serverName}.${call.toolName}`,
        call.arguments,
      );

      try {
        const result = await connector.executeTool(
          call.serverName,
          call.toolName,
          call.arguments,
        );

        const resultStr = typeof result === "string"
          ? result
          : JSON.stringify(result);

        logger.info("orchestrator", `Tool result: ${truncate(resultStr, MAX_CONTENT_PREVIEW)}`);

        messages.push({
          role: "tool_result",
          content: resultStr,
          toolCallId: call.id,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error("orchestrator", `Tool error: ${errorMsg}`);

        messages.push({
          role: "tool_result",
          content: JSON.stringify({ success: false, error: errorMsg }),
          toolCallId: call.id,
        });
      }
    }
  }

  throw new Error(`Exceeded max turns (${config.task.maxTurns}) without completion`);
}
