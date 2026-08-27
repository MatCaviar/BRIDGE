/**
 * SSE event types for the real-time dashboard.
 *
 * Each event is a discriminated union over `type`.
 * Wire format: `event: <type>\ndata: <JSON>\n\n`
 */

export interface SessionStartedEvent {
  readonly type: "session_started";
  readonly sessionId: string;
  readonly timestamp: string;
  readonly userMessage: string;
}

export interface ToolsDiscoveredEvent {
  readonly type: "tools_discovered";
  readonly timestamp: string;
  readonly toolCount: number;
  readonly tools: ReadonlyArray<{
    readonly serverName: string;
    readonly name: string;
    readonly qualifiedName: string;
    readonly description: string;
    readonly inputSchema: Record<string, unknown>;
    readonly annotations?: Readonly<Record<string, unknown>>;
    readonly safetyLevel: "readonly" | "normal";
  }>;
}

export interface SystemPromptEvent {
  readonly type: "system_prompt";
  readonly timestamp: string;
  readonly content: string;
  readonly source: "config" | "fallback";
}

export interface TurnStartedEvent {
  readonly type: "turn_started";
  readonly timestamp: string;
  readonly turn: number;
  readonly maxTurns: number;
}

export interface LlmRequestEvent {
  readonly type: "llm_request";
  readonly timestamp: string;
  readonly turn: number;
  readonly messageCount: number;
  readonly provider: string;
  readonly model: string;
}

export interface LlmResponseEvent {
  readonly type: "llm_response";
  readonly timestamp: string;
  readonly turn: number;
  readonly text: string;
  readonly stopReason: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
  /** Wall-clock ms from llm_request to this response. */
  readonly durationMs: number;
}

export interface ToolCallStartedEvent {
  readonly type: "tool_call_started";
  readonly timestamp: string;
  readonly turn: number;
  readonly callId: string;
  readonly serverName: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
}

export interface ToolCallCompletedEvent {
  readonly type: "tool_call_completed";
  readonly timestamp: string;
  readonly turn: number;
  readonly callId: string;
  readonly serverName: string;
  readonly toolName: string;
  readonly resultPreview: string;
  /** 完整结果(不截断) — cockpit 全量展示用 */
  readonly resultFull: string;
  /** Wall-clock ms from tool_call_started to this event. */
  readonly durationMs: number;
}

export interface ToolCallErrorEvent {
  readonly type: "tool_call_error";
  readonly timestamp: string;
  readonly turn: number;
  readonly callId: string;
  readonly serverName: string;
  readonly toolName: string;
  readonly error: string;
  /** Wall-clock ms from tool_call_started to this error. */
  readonly durationMs: number;
}

export interface TurnCompletedEvent {
  readonly type: "turn_completed";
  readonly timestamp: string;
  readonly turn: number;
  readonly hadToolCalls: boolean;
  /** Wall-clock ms from turn_started to this event. */
  readonly durationMs: number;
}

export interface SessionCompletedEvent {
  readonly type: "session_completed";
  readonly timestamp: string;
  readonly totalTurns: number;
  readonly totalInputTokens: number;
  readonly totalOutputTokens: number;
  readonly finalText: string;
  /** Wall-clock ms from session_started to this event. */
  readonly durationMs: number;
  /** Per-turn breakdown: [turnNumber, durationMs]. */
  readonly turnDurations: ReadonlyArray<{ readonly turn: number; readonly durationMs: number }>;
}

export interface SessionErrorEvent {
  readonly type: "session_error";
  readonly timestamp: string;
  readonly error: string;
  /** Wall-clock ms from session_started to this error (if applicable). */
  readonly durationMs?: number;
}

export type DashboardEvent =
  | SessionStartedEvent
  | ToolsDiscoveredEvent
  | SystemPromptEvent
  | TurnStartedEvent
  | LlmRequestEvent
  | LlmResponseEvent
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  | ToolCallErrorEvent
  | TurnCompletedEvent
  | SessionCompletedEvent
  | SessionErrorEvent;
