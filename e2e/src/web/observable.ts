/**
 * Observable orchestrator — same logic as ../orchestrator.ts but emits
 * SSE events with detailed timing to an EventEmitter.
 */

import { EventEmitter } from "node:events";
import type { LLMClient, Message } from "../llm/types.js";
import type { GatewayConfig } from "../config.js";
import { McpConnector } from "../mcp/connector.js";
import { convertSchemas } from "../mcp/schema-convert.js";
import type {
  DashboardEvent,
  SessionStartedEvent,
  ToolsDiscoveredEvent,
  SystemPromptEvent,
  TurnStartedEvent,
  LlmRequestEvent,
  LlmResponseEvent,
  ToolCallStartedEvent,
  ToolCallCompletedEvent,
  ToolCallErrorEvent,
  TurnCompletedEvent,
  SessionCompletedEvent,
  SessionErrorEvent,
} from "./events.js";

const MAX_RESULT_PREVIEW = 500;

function ts(): string {
  return new Date().toISOString();
}

function msSince(start: number): number {
  return Date.now() - start;
}

function emit(emitter: EventEmitter, event: DashboardEvent): void {
  emitter.emit("event", event);
}

export async function runObservable(
  llm: LLMClient,
  connector: McpConnector,
  config: GatewayConfig,
  emitter: EventEmitter,
  sessionId: string,
): Promise<string> {
  const sessionStart = Date.now();

  // ── Phase 1: Prepare tools ──

  emit(emitter, {
    type: "session_started",
    sessionId,
    timestamp: ts(),
    userMessage: config.task.userMessage,
  } satisfies SessionStartedEvent);

  const toolDefs = connector.getToolDefinitions();

  emit(emitter, {
    type: "tools_discovered",
    timestamp: ts(),
    toolCount: toolDefs.length,
    tools: toolDefs.map((t) => ({
      serverName: t.serverName,
      name: t.name,
      qualifiedName: t.qualifiedName,
      description: t.description,
    })),
  } satisfies ToolsDiscoveredEvent);

  if (toolDefs.length === 0) {
    throw new Error("No MCP tools discovered — check server configuration");
  }

  const llmTools = convertSchemas(toolDefs, config.llm.provider);

  const promptFetchStart = Date.now();
  let systemPrompt: string;
  let promptSource: "config" | "mcp_server" | "fallback" = "fallback";
  if (config.task.systemPrompt !== null) {
    systemPrompt = config.task.systemPrompt;
    promptSource = "config";
  } else {
    const fetched = await connector.fetchPrompt("aipet-guide");
    if (fetched) {
      systemPrompt = fetched;
      promptSource = "mcp_server";
    } else {
      systemPrompt = "You are a helpful assistant with access to tools. Use them to help the user.";
    }
  }

  emit(emitter, {
    type: "system_prompt",
    timestamp: ts(),
    content: systemPrompt.substring(0, 200),
    source: promptSource,
  } satisfies SystemPromptEvent);

  // ── Phase 2: Execution loop ──

  const messages: Message[] = [
    { role: "user", content: config.task.userMessage },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const turnDurations: Array<{ turn: number; durationMs: number }> = [];

  for (let turn = 0; turn < config.task.maxTurns; turn++) {
    const turnStart = Date.now();

    emit(emitter, {
      type: "turn_started",
      timestamp: ts(),
      turn: turn + 1,
      maxTurns: config.task.maxTurns,
    } satisfies TurnStartedEvent);

    emit(emitter, {
      type: "llm_request",
      timestamp: ts(),
      turn: turn + 1,
      messageCount: messages.length,
      provider: config.llm.provider,
      model: config.llm.model,
    } satisfies LlmRequestEvent);

    const llmStart = Date.now();
    const response = await llm.createMessage({
      systemPrompt,
      messages,
      tools: llmTools,
    });
    const llmDuration = msSince(llmStart);

    totalInputTokens += response.usage.inputTokens;
    totalOutputTokens += response.usage.outputTokens;

    emit(emitter, {
      type: "llm_response",
      timestamp: ts(),
      turn: turn + 1,
      text: response.text,
      stopReason: response.stopReason,
      usage: response.usage,
      durationMs: llmDuration,
    } satisfies LlmResponseEvent);

    // No tool calls → final answer
    if (response.toolCalls.length === 0) {
      const turnDuration = msSince(turnStart);
      turnDurations.push({ turn: turn + 1, durationMs: turnDuration });

      emit(emitter, {
        type: "turn_completed",
        timestamp: ts(),
        turn: turn + 1,
        hadToolCalls: false,
        durationMs: turnDuration,
      } satisfies TurnCompletedEvent);

      emit(emitter, {
        type: "session_completed",
        timestamp: ts(),
        totalTurns: turn + 1,
        totalInputTokens,
        totalOutputTokens,
        finalText: response.text,
        durationMs: msSince(sessionStart),
        turnDurations: Object.freeze([...turnDurations]),
      } satisfies SessionCompletedEvent);

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
      emit(emitter, {
        type: "tool_call_started",
        timestamp: ts(),
        turn: turn + 1,
        callId: call.id,
        serverName: call.serverName,
        toolName: call.toolName,
        arguments: call.arguments,
      } satisfies ToolCallStartedEvent);

      const toolStart = Date.now();

      try {
        const result = await connector.executeTool(
          call.serverName,
          call.toolName,
          call.arguments,
        );
        const toolDuration = msSince(toolStart);

        const resultStr = typeof result === "string"
          ? result
          : result === null || result === undefined
            ? "(no result)"
            : JSON.stringify(result);

        const preview = resultStr.length > MAX_RESULT_PREVIEW
          ? resultStr.substring(0, MAX_RESULT_PREVIEW) + "..."
          : resultStr;

        messages.push({
          role: "tool_result",
          content: resultStr,
          toolCallId: call.id,
        });

        emit(emitter, {
          type: "tool_call_completed",
          timestamp: ts(),
          turn: turn + 1,
          callId: call.id,
          serverName: call.serverName,
          toolName: call.toolName,
          resultPreview: preview,
          durationMs: toolDuration,
        } satisfies ToolCallCompletedEvent);
      } catch (error) {
        const toolDuration = msSince(toolStart);
        const errorMsg = error instanceof Error ? error.message : String(error);

        messages.push({
          role: "tool_result",
          content: JSON.stringify({ success: false, error: errorMsg }),
          toolCallId: call.id,
        });

        emit(emitter, {
          type: "tool_call_error",
          timestamp: ts(),
          turn: turn + 1,
          callId: call.id,
          serverName: call.serverName,
          toolName: call.toolName,
          error: errorMsg,
          durationMs: toolDuration,
        } satisfies ToolCallErrorEvent);
      }
    }

    const turnDuration = msSince(turnStart);
    turnDurations.push({ turn: turn + 1, durationMs: turnDuration });

    emit(emitter, {
      type: "turn_completed",
      timestamp: ts(),
      turn: turn + 1,
      hadToolCalls: true,
      durationMs: turnDuration,
    } satisfies TurnCompletedEvent);
  }

  const maxTurnsError = `Exceeded max turns (${config.task.maxTurns}) without completion`;
  emit(emitter, {
    type: "session_error",
    timestamp: ts(),
    error: maxTurnsError,
    durationMs: msSince(sessionStart),
  } satisfies SessionErrorEvent);

  return maxTurnsError;
}
