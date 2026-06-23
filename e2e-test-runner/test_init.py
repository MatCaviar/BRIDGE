#!/usr/bin/env python3
"""Test initialization only - Professional CLI Edition"""

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
from cli_formatter import CLIFormatter, Spinner, Timer, Style


class MockTaskLog:
    def __init__(self, formatter: CLIFormatter):
        self.formatter = formatter

    def log_step(self, level: str, component: str, message: str) -> None:
        icon = "ℹ" if level == "info" else "⚠" if level == "warning" else "✗"
        print(f"{self.formatter.colorize(icon, Style.INFO)} {self.formatter.colorize(component, Style.METADATA)} │ {message}")


async def test_initialization():
    """Test all initialization steps"""
    formatter = CLIFormatter()

    print(formatter.header("Initialization Test", "", width=80))
    print(formatter.section("Starting Initialization Test"))

    # Load YAML config
    config = load_config()

    # Initialize server manager and gateway
    server_manager = ServerManager(config)
    gateway = MCPGateway(server_manager)

    # Step 1: Start MCP servers
    print(formatter.section("Step 1: MCP Servers"))

    with Spinner("progress", "Starting servers") as spin:
        spin.update("Initializing server manager...")
        start_results = await server_manager.start_all()
        started_count = sum(1 for v in start_results.values() if v)
        spin.update(f"Started {started_count}/{len(start_results)} servers")

    print()
    # Display server status
    server_names = [s.get("name", "unknown") for s in config.get("servers", [])]
    print(formatter.compact_status([
        {"name": name, "status": "ok" if name in start_results and start_results[name] else "error"}
        for name in server_names
    ]))

    # Step 2: Initialize connections
    print()
    print(formatter.section("Step 2: MCP Connections"))

    with Spinner("progress", "Initializing connections"):
        await gateway.initialize_all()

    print(formatter.status_line("●", "Connections initialized", Style.SUCCESS))

    # Step 3: Initialize LLM client
    print()
    print(formatter.section("Step 3: LLM Client"))

    simple_config = SimpleConfig(config)
    task_log = MockTaskLog(formatter)

    try:
        llm_client = ClientFactory(
            task_id="init-test", cfg=simple_config, task_log=task_log
        )
        print(formatter.status_line("●", f"LLM client ready: {config['llm']['model_name']}", Style.SUCCESS))
    except Exception as e:
        print(formatter.status_line("✗", f"ERROR: {e}", Style.ERROR))
        raise

    # Step 4: Generate system prompt
    print()
    print(formatter.section("Step 4: System Prompt"))

    system_prompt = generate_system_prompt_from_servers(config)
    print(formatter.metric("Prompt length", f"{len(system_prompt)}", "chars"))

    # Step 5: Test tool listing
    print()
    print(formatter.section("Step 5: Tool Listing"))

    with Timer() as timer:
        tools = await gateway.list_tools("imaudio")

    latency = timer.elapsed_ms
    print(formatter.metric("Latency", f"{latency:.0f}", "ms"))

    tool_names = [t['name'] for t in tools]
    print()
    print(formatter.colorize("imaudio tools:", Style.METADATA))
    for tool_name in tool_names[:10]:  # Show first 10
        print(f"  • {formatter.colorize(tool_name, Style.DIM)}")
    if len(tool_names) > 10:
        print(f"  ... and {len(tool_names) - 10} more")

    # Cleanup
    print()
    print(formatter.section("Cleanup"))

    with Spinner("progress", "Stopping servers"):
        await server_manager.stop_all()

    print()
    print(formatter.status_line("✓", "Initialization Test PASSED", Style.SUCCESS))


if __name__ == "__main__":
    asyncio.run(test_initialization())