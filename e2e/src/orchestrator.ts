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

  // System prompt: config override → generic tool-using fallback.
  const systemPrompt = config.task.systemPrompt
    ?? "You are a helpful assistant with access to tools. Use them to help the user.";
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

        // 状态类 app UI 同步: 执行成功后自动点"当前状态"控件(走 app 交互路径, UI 无感刷新)
        await syncUiAfterTool(config, call, connector);
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

/** 状态类 app UI 同步(ui_sync 规则): 工具执行成功后, 按 args[argKey] 查 map → bridge-ui.ui_tap_text 点击。
 *  失败静默(控件不在当前屏/UI 未开时无副作用); 对 LLM 透明。 */
async function syncUiAfterTool(
  config: GatewayConfig,
  call: { serverName: string; toolName: string; arguments: Record<string, unknown> },
  connector: McpConnector,
): Promise<void> {
  const rules = config.uiSync ?? [];
  const rule = rules.find((r) => r.tool === call.toolName);
  if (!rule) return;
  const raw = call.arguments?.[rule.argKey];
  if (raw === undefined || raw === null) return;
  const text = rule.map[String(raw)];
  if (!text) return;
  try {
    logger.info("orchestrator", `ui_sync: ${call.toolName}=${raw} -> tap "${text}"`);
    await connector.executeTool("bridge-ui", "ui_tap_text", { text });
  } catch (e) {
    logger.warn("orchestrator", `ui_sync tap failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
  }
}
