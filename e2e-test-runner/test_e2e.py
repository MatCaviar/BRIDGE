#!/usr/bin/env python3
"""Test full E2E flow with LLM call - Professional CLI Edition"""

import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))

from gateway import MCPGateway
from prompt_generator import generate_system_prompt_from_servers
from servers import ServerManager
from config_loader import load_config, SimpleConfig
from llm.factory import ClientFactory
from utils.parsing_utils import parse_llm_response_for_tool_calls
from cli_formatter import CLIFormatter, Spinner, Timer, Style


class MockTaskLog:
    def __init__(self, formatter: CLIFormatter):
        self.formatter = formatter

    def log_step(self, level: str, component: str, message: str) -> None:
        icon = "ℹ" if level == "info" else "⚠" if level == "warning" else "✗"
        print(f"{self.formatter.colorize(icon, Style.INFO)} {self.formatter.colorize(component, Style.METADATA)} │ {message}")


async def test_e2e_flow():
    """Test full E2E flow: LLM call -> tool execution -> response"""
    formatter = CLIFormatter()

    print(formatter.header("E2E Flow Test", "", width=80))
    print(formatter.section("Starting E2E Test"))

    # Load YAML config
    config = load_config()

    # Initialize
    server_manager = ServerManager(config)
    gateway = MCPGateway(server_manager)

    # Start servers
    with Spinner("progress", "Starting servers") as spin:
        spin.update("Initializing server manager...")
        await server_manager.start_all()
        spin.update("Starting MCP servers...")
        await gateway.initialize_all()

    print()
    print(formatter.status_line("●", "Servers started", Style.SUCCESS))

    # Initialize LLM client
    print()
    print(formatter.section("LLM Client"))

    simple_config = SimpleConfig(config)
    task_log = MockTaskLog(formatter)
    llm_client = ClientFactory(task_id="e2e-test", cfg=simple_config, task_log=task_log)

    print(formatter.status_line("●", "LLM client ready", Style.SUCCESS))

    # Test simple query
    print()
    print(formatter.section("Testing LLM Call"))

    system_prompt = generate_system_prompt_from_servers(config)

    message_history = [
        {"role": "user", "content": "帮我检查一下音频系统的健康状态"}
    ]

    try:
        with Timer() as timer:
            response, _ = await llm_client.create_message(
                system_prompt=system_prompt,
                message_history=message_history,
                tool_definitions=None,
            )

        latency = timer.elapsed_ms
        print(formatter.metric("Latency", f"{latency:.0f}", "ms"))

        # Process response
        assistant_text, should_exit, updated_history = llm_client.process_llm_response(
            response, message_history
        )

        response_preview = assistant_text[:300] + "..." if len(assistant_text) > 300 else assistant_text
        print()
        print(formatter.colorize("Response:", Style.METADATA))
        print(formatter.colorize(response_preview, Style.DIM))

        # Check for tool calls
        tool_calls = parse_llm_response_for_tool_calls(assistant_text)

        if tool_calls:
            print()
            print(formatter.section(f"Tool Execution ({len(tool_calls)} call(s))"))

            for i, tool_call in enumerate(tool_calls, 1):
                server_name = tool_call.get("server_name", "")
                tool_name = tool_call.get("tool_name", "")
                arguments = tool_call.get("arguments", {})

                print(formatter.tool_call(server_name, tool_name, arguments))

                result = await gateway.execute_tool_call(server_name, tool_name, arguments)
                formatted = gateway.format_tool_result(result)

                result_preview = formatted[:200] + "..." if len(formatted) > 200 else formatted
                print(f"  {formatter.colorize('→', Style.INFO)} {formatter.colorize(result_preview, Style.DIM)}")

        print()
        print(formatter.status_line("✓", "E2E Test PASSED", Style.SUCCESS))

    except Exception as e:
        print()
        print(formatter.status_line("✗", f"ERROR: {e}", Style.ERROR))
        import traceback
        traceback.print_exc()

    finally:
        print()
        print(formatter.section("Cleanup"))
        with Spinner("progress", "Stopping servers"):
            await server_manager.stop_all()

        print()
        print(formatter.status_line("○", "Test complete", Style.METADATA))


if __name__ == "__main__":
    asyncio.run(test_e2e_flow())