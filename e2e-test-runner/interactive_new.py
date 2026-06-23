#!/usr/bin/env python3
"""
Professional Interactive E2E Test Runner for MCP Servers
High information density, elegant styling, professional appearance
"""

import asyncio
import json
import logging
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

sys.path.insert(0, str(Path(__file__).parent.resolve()))

from gateway import MCPGateway
from prompt_generator import generate_system_prompt_from_servers
from servers import ServerManager
from config_loader import load_config, SimpleConfig
from cli_formatter import CLIFormatter, Spinner, Timer, Style, Color

# Configure logging with custom formatter
class ColoredFormatter(logging.Formatter):
    """Custom formatter with color support"""

    def __init__(self):
        super().__init__(fmt="%(message)s", datefmt=None)
        self.formatter = CLIFormatter()

    def format(self, record):
        # Colorize based on level
        if record.levelno >= logging.ERROR:
            level_style = Style.ERROR
            level_str = "✗"
        elif record.levelno >= logging.WARNING:
            level_style = Style.WARNING
            level_str = "⚠"
        elif record.levelno >= logging.INFO:
            level_style = Style.INFO
            level_str = "ℹ"
        else:
            level_style = Style.METADATA
            level_str = "•"

        message = record.getMessage()
        return f"{self.formatter.colorize(level_str, level_style)} {message}"


# Set up colored logging
logger = logging.getLogger("mcp-e2e")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(ColoredFormatter())
logger.addHandler(handler)

# LLM client imports
from llm.factory import ClientFactory
from utils.parsing_utils import parse_llm_response_for_tool_calls


class MockTaskLog:
    """Enhanced task logger with beautiful formatting"""

    def __init__(self, formatter: CLIFormatter):
        self.formatter = formatter

    def log_step(self, level: str, component: str, message: str) -> None:
        if level == "info":
            logger.info(f"{self.formatter.colorize(component, Style.METADATA)} │ {message}")
        elif level == "warning":
            logger.warning(f"{self.formatter.colorize(component, Style.METADATA)} │ {message}")
        else:
            logger.error(f"{self.formatter.colorize(component, Style.METADATA)} │ {message}")


class E2ETestRunner:
    """Enhanced E2E test runner with professional CLI interface"""

    def __init__(self, config_path: str | Path = None):
        self.config = load_config(config_path)
        self.max_retries = self.config.get("max_retries", 3)
        self.server_manager: ServerManager | None = None
        self.gateway: MCPGateway | None = None
        self.llm_client = None
        self.message_history: List[Dict[str, Any]] = []
        self.formatter = CLIFormatter()
        self.task_log = MockTaskLog(self.formatter)
        self.session_stats = {
            "total_turns": 0,
            "total_tool_calls": 0,
            "total_latency_ms": 0,
            "total_tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0}
        }

    async def initialize(self) -> None:
        """Initialize all components with beautiful progress display"""
        print(self.formatter.header(
            "MCP E2E Test Runner",
            f"Model: {self.config['llm']['model_name']}",
            width=80
        ))

        # Step 1: Initialize server manager and gateway
        print(self.formatter.section("Initialization"))
        self.server_manager = ServerManager(self.config)
        self.gateway = MCPGateway(self.server_manager)

        # Start MCP servers with spinner
        with Spinner("progress", "Starting MCP servers") as spin:
            spin.update("Starting MCP servers...")
            start_results = await self.server_manager.start_all()
            started_count = sum(1 for v in start_results.values() if v)
            spin.update(f"Started {started_count}/{len(start_results)} servers")

        # Display server status
        server_names = [s.get("name", "unknown") for s in self.config.get("servers", [])]
        print(self.formatter.compact_status([
            {"name": name, "status": "ok" if name in start_results and start_results[name] else "error"}
            for name in server_names
        ]))

        # Initialize connections
        with Spinner("progress", "Initializing connections") as spin:
            await self.gateway.initialize_all()

        # Initialize LLM client
        await self._init_llm_client()

        # Ready message
        print()
        print(self.formatter.status_line("●", "Ready for input", Style.SUCCESS))

    async def _init_llm_client(self) -> None:
        """Initialize LLM client with YAML config"""
        config = SimpleConfig(self.config)
        self.llm_client = ClientFactory(
            task_id="e2e-test",
            cfg=config,
            task_log=self.task_log
        )

    async def process_user_input(self, user_input: str) -> str:
        """Process user input with beautiful ReAct loop display"""
        # Reset for new query
        self.message_history = []
        self.message_history.append({"role": "user", "content": user_input})

        # Generate system prompt
        system_prompt = generate_system_prompt_from_servers(self.config)

        # ReAct loop with enhanced display
        turn_count = 0
        max_turns = self.max_retries * 2
        total_latency = 0

        print()
        print(self.formatter.colorize("▌ ReAct Loop", Style.SUBHEADER))

        while turn_count < max_turns:
            turn_count += 1
            print()
            print(f"  {self.formatter.colorize(f'Turn {turn_count}/{max_turns}', Style.METADATA)}")

            try:
                # Call LLM with timing
                with Timer() as timer:
                    response, _ = await self.llm_client.create_message(
                        system_prompt=system_prompt,
                        message_history=self.message_history,
                        tool_definitions=None,
                    )

                # Process response
                assistant_text, should_exit, updated_history = self.llm_client.process_llm_response(
                    response, self.message_history
                )
                self.message_history = updated_history

                # Display latency
                latency = timer.elapsed_ms
                total_latency += latency
                latency_style = Style.LATENCY_FAST if latency < 2000 else Style.LATENCY_NORMAL
                if latency > 5000:
                    latency_style = Style.LATENCY_SLOW

                print(f"    {self.formatter.metric('Latency', f'{latency:.0f}', 'ms')}")

                # Display LLM response (truncated for readability)
                response_preview = assistant_text[:200] + "..." if len(assistant_text) > 200 else assistant_text
                print()
                print(f"    {self.formatter.colorize('Response:', Style.METADATA)}")
                for line in response_preview.split('\n'):
                    print(f"    {self.formatter.colorize(line, Style.DIM)}")

                if should_exit:
                    print()
                    print(self.formatter.status_line("⊘", "Exit condition signaled", Style.WARNING))
                    return assistant_text

                # Extract and display tool calls
                tool_calls = parse_llm_response_for_tool_calls(assistant_text)

                if not tool_calls:
                    print()
                    print(self.formatter.status_line("✓", "Final answer provided", Style.SUCCESS))
                    return assistant_text

                # Display tool calls beautifully
                print()
                print(f"    {self.formatter.colorize(f'Tools: {len(tool_calls)} call(s)', Style.TOOL)}")
                for i, tc in enumerate(tool_calls, 1):
                    server_name = tc.get("server_name", "unknown")
                    tool_name = tc.get("tool_name", "unknown")
                    arguments = tc.get("arguments", {})

                    print(self.formatter.tool_call(server_name, tool_name, arguments))

                # Execute tool calls
                print()
                print(f"    {self.formatter.colorize('Executing...', Style.METADATA)}")

                tool_results = []
                for tool_call in tool_calls:
                    server_name = tool_call.get("server_name", "")
                    tool_name = tool_call.get("tool_name", "")
                    arguments = tool_call.get("arguments", {})

                    result = await self.gateway.execute_tool_call(server_name, tool_name, arguments)
                    formatted_result = self.gateway.format_tool_result(result)
                    tool_results.append(formatted_result)

                # Add results to conversation
                tool_results_text = "\n\n".join(tool_results)
                self.message_history.append({"role": "user", "content": tool_results_text})

                print(f"    {self.formatter.status_line('→', 'Results fed to LLM', Style.INFO)}")

            except Exception as e:
                print()
                print(self.formatter.status_line("✗", f"Error: {str(e)}", Style.ERROR))
                self.message_history.append({
                    "role": "user",
                    "content": f"Error occurred: {str(e)}. Please try again."
                })

        # Max turns reached
        print()
        print(self.formatter.status_line("⊘", f"Max turns ({max_turns}) reached", Style.WARNING))
        return "Unable to complete the task after multiple attempts."

    async def run_interactive_loop(self) -> None:
        """Run interactive REPL loop with enhanced prompt"""
        await self.initialize()

        while True:
            try:
                # Enhanced prompt
                prompt = f"\n{self.formatter.colorize('❯', Style.PRIMARY)} "
                user_input = input(prompt).strip()

                if not user_input:
                    continue

                if user_input.lower() in ["quit", "exit", "q"]:
                    print()
                    print(self.formatter.status_line("○", "Shutting down...", Style.METADATA))
                    break

                # Process input
                print()
                print(self.formatter.colorize(f"▸ Processing: {user_input}", Style.ACCENT))

                with Timer() as timer:
                    response = await self.process_user_input(user_input)

                # Display final response if meaningful
                if response and "Unable to complete" not in response:
                    print()
                    print(self.formatter.colorize("▌ Final Response", Style.SUBHEADER))
                    print(f"  {response}")

            except KeyboardInterrupt:
                print()
                print(self.formatter.status_line("⊘", "Interrupted", Style.WARNING))
                break
            except EOFError:
                print()
                print(self.formatter.status_line("⊘", "EOF received", Style.WARNING))
                break
            except Exception as e:
                print(self.formatter.status_line("✗", f"Error: {e}", Style.ERROR))
                continue

        await self.shutdown()

    async def shutdown(self) -> None:
        """Shutdown all components"""
        if self.server_manager:
            with Spinner("progress", "Stopping servers") as spin:
                await self.server_manager.stop_all()

        print()
        print(self.formatter.status_line("○", "Done", Style.METADATA))


async def main() -> None:
    """Main entry point"""
    runner = E2ETestRunner()
    await runner.run_interactive_loop()


if __name__ == "__main__":
    asyncio.run(main())