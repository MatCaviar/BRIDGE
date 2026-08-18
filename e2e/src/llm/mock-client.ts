/**
 * Mock LLM client for testing the orchestrator loop
 * without requiring real API keys.
 *
 * Simulates a multi-turn conversation that calls MCP tools.
 */
import type { LLMClient, LLMResponse, Message, ToolCall } from "./types.js";

// Simulated turn plan: what the mock LLM "decides" to do each turn
interface MockTurn {
  readonly text: string;
  readonly toolCalls: readonly MockToolCall[];
}

interface MockToolCall {
  readonly serverName: string;
  readonly toolName: string;
  readonly arguments: Record<string, unknown>;
}

const AIPET_FLOW: readonly MockTurn[] = [
  {
    text: "我来帮你拍一张萌宠！先检查车辆状态...",
    toolCalls: [
      { serverName: "aipet", toolName: "get_gear_status", arguments: {} },
    ],
  },
  {
    text: "车辆已挂P档，开始拍照...",
    toolCalls: [
      { serverName: "aipet", toolName: "capture_photo", arguments: {} },
    ],
  },
  {
    text: "拍照成功！正在生成萌宠形象...",
    toolCalls: [
      {
        serverName: "aipet",
        toolName: "generate_pet_avatar",
        arguments: { sourceImagePath: "/mock/photos/rear_0_mock_0001.jpg", style: "cartoon" },
      },
    ],
  },
  {
    text: "萌宠形象已生成！正在设为屏保...",
    toolCalls: [
      {
        serverName: "aipet",
        toolName: "apply_pet_avatar",
        arguments: {
          imagePath: "/mock/avatars/cartoon_mock_0002.png",
          scenes: ["screensaver"],
          confirmed: true,
        },
      },
    ],
  },
  {
    text: "✅ 萌宠形象已成功设为屏保！您的车内现在有了一只可爱的萌宠伴侣。",
    toolCalls: [],
  },
];

export class MockLLMClient implements LLMClient {
  private turnIndex = 0;

  async createMessage(): Promise<LLMResponse> {
    const turn = AIPET_FLOW[this.turnIndex] ?? AIPET_FLOW[AIPET_FLOW.length - 1]!;
    this.turnIndex++;

    const toolCalls: ToolCall[] = turn.toolCalls.map((tc, i) => ({
      id: `mock_call_${this.turnIndex}_${i}`,
      serverName: tc.serverName,
      toolName: tc.toolName,
      arguments: tc.arguments,
    }));

    return {
      text: turn.text,
      toolCalls,
      stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn",
      usage: { inputTokens: 500, outputTokens: 100 },
    };
  }
}
