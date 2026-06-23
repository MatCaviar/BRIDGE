"""
MCP Server Process Manager

Manages multiple MCP server processes, starting/stopping them via stdio.
"""

import asyncio
import json
import signal
from pathlib import Path
from typing import Any, Dict, List, Optional

import asyncio.subprocess as subprocess


class MCPServer:
    """Represents a single MCP server process"""

    def __init__(self, config: Dict[str, Any]):
        """
        Initialize MCP server from config.

        Args:
            config: Server config from servers.json
                {
                    "name": "imaudio",
                    "path": "../mcp-imaudio",
                    "command": "node",
                    "args": ["dist/server.js"],
                    "analysis_json": "../schema/__tests__/fixtures/imaudio-analysis.json"
                }
        """
        self.name = config["name"]
        self.path = Path(config["path"]).resolve()
        self.command = config["command"]
        self.args = config.get("args", [])
        self.analysis_json = Path(config.get("analysis_json", "")).resolve()

        self.process: Optional[subprocess.Process] = None
        self.stdin_writer: Optional[asyncio.StreamWriter] = None
        self.stdout_reader: Optional[asyncio.StreamReader] = None
        self.stderr_reader: Optional[asyncio.StreamReader] = None

    @property
    def is_running(self) -> bool:
        """Check if server process is running"""
        return self.process is not None and self.process.returncode is None

    async def start(self) -> bool:
        """
        Start the MCP server process.

        Returns:
            True if started successfully, False otherwise
        """
        if self.is_running:
            print(f"Server '{self.name}' is already running")
            return True

        # Check if server directory exists
        if not self.path.exists():
            print(f"Error: Server path does not exist: {self.path}")
            return False

        # Build full command
        full_command = [self.command] + self.args

        print(f"Starting server '{self.name}': {' '.join(full_command)}")

        try:
            # Start subprocess with pipes for stdin/stdout/stderr
            self.process = await asyncio.create_subprocess_exec(
                *full_command,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=self.path,
            )

            # Get streams
            self.stdin_writer = self.process.stdin
            self.stdout_reader = self.process.stdout
            self.stderr_reader = self.process.stderr

            # Wait a bit for server to start
            await asyncio.sleep(0.5)

            if self.process.returncode is not None:
                # Process exited immediately - read stderr for error
                stderr = await asyncio.wait_for(self.stderr_reader.read(), timeout=1.0)
                print(f"Error starting server '{self.name}': {stderr.decode('utf-8', errors='ignore')}")
                return False

            print(f"Server '{self.name}' started (PID: {self.process.pid})")
            return True

        except Exception as e:
            print(f"Failed to start server '{self.name}': {e}")
            return False

    async def stop(self) -> bool:
        """
        Stop the MCP server process.

        Returns:
            True if stopped successfully, False otherwise
        """
        if not self.is_running:
            print(f"Server '{self.name}' is not running")
            return True

        try:
            # Try graceful shutdown
            self.process.send_signal(signal.SIGTERM)

            # Wait for process to exit (with timeout)
            try:
                await asyncio.wait_for(self.process.wait(), timeout=5.0)
                print(f"Server '{self.name}' stopped gracefully")
            except asyncio.TimeoutError:
                # Force kill if graceful shutdown failed
                self.process.kill()
                await self.process.wait()
                print(f"Server '{self.name}' force killed")

            # Close streams
            if self.stdin_writer:
                self.stdin_writer.close()
                await self.stdin_writer.wait_closed()

            self.process = None
            self.stdin_writer = None
            self.stdout_reader = None
            self.stderr_reader = None

            return True

        except Exception as e:
            print(f"Error stopping server '{self.name}': {e}")
            return False

    async def send(self, data: str) -> None:
        """
        Send data to server via stdin.

        Args:
            data: JSON string to send
        """
        if not self.is_running or not self.stdin_writer:
            raise RuntimeError(f"Server '{self.name}' is not running")

        self.stdin_writer.write(data.encode("utf-8"))
        self.stdin_writer.write("\n".encode("utf-8"))
        await self.stdin_writer.drain()

    async def receive(self) -> Optional[str]:
        """
        Receive data from server via stdout.

        Returns:
            Received line (without newline), or None if EOF
        """
        if not self.is_running or not self.stdout_reader:
            raise RuntimeError(f"Server '{self.name}' is not running")

        try:
            line = await asyncio.wait_for(self.stdout_reader.readline(), timeout=30.0)
            if not line:
                return None
            return line.decode("utf-8").rstrip("\n\r")
        except asyncio.TimeoutError:
            print(f"Timeout reading from server '{self.name}'")
            return None

    async def read_stderr(self) -> str:
        """
        Read all available stderr output.

        Returns:
            Stderr content
        """
        if not self.is_running or not self.stderr_reader:
            return ""

        try:
            data = await asyncio.wait_for(self.stderr_reader.read(), timeout=1.0)
            return data.decode("utf-8", errors="ignore")
        except asyncio.TimeoutError:
            return ""

    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """
        Get tool definitions from analysis.json.

        Returns:
            List of tool definitions
        """
        if not self.analysis_json.exists():
            print(f"Warning: analysis.json not found: {self.analysis_json}")
            return []

        try:
            with open(self.analysis_json, "r", encoding="utf-8") as f:
                analysis = json.load(f)

            # Extract tool definitions from capabilities
            tools = []
            for cap in analysis.get("capabilities", []):
                tool = {
                    "name": cap["id"],
                    "description": f"{cap['action']} {cap['object']}",
                    "schema": cap.get("params", {}),
                }
                tools.append(tool)

            return tools

        except Exception as e:
            print(f"Error reading analysis.json for '{self.name}': {e}")
            return []


class ServerManager:
    """Manages multiple MCP server processes"""

    def __init__(self, config: str | list | Dict[str, Any] = "servers.json"):
        """
        Initialize server manager.

        Args:
            config: Can be:
                - Path to servers.json config file (str)
                - List of server configs (from YAML)
                - Dict with "servers" key
        """
        self.servers: Dict[str, MCPServer] = {}
        self._load_config(config)

    def _load_config(self, config: str | list | Dict[str, Any]) -> None:
        """Load server configuration from various sources"""
        server_configs = []

        if isinstance(config, str):
            # Load from JSON file
            config_path = Path(config).resolve()
            if not config_path.exists():
                raise FileNotFoundError(f"Config file not found: {config_path}")

            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            server_configs = data.get("servers", [])

        elif isinstance(config, dict):
            # Direct dict (from YAML config)
            server_configs = config.get("servers", [])

        elif isinstance(config, list):
            # Direct list of server configs
            server_configs = config

        else:
            raise TypeError(f"Invalid config type: {type(config)}")

        # Create server instances
        for server_config in server_configs:
            server = MCPServer(server_config)
            self.servers[server.name] = server

    async def start_server(self, name: str) -> bool:
        """
        Start a specific server.

        Args:
            name: Server name

        Returns:
            True if started successfully, False otherwise
        """
        if name not in self.servers:
            print(f"Error: Unknown server '{name}'")
            return False

        return await self.servers[name].start()

    async def stop_server(self, name: str) -> bool:
        """
        Stop a specific server.

        Args:
            name: Server name

        Returns:
            True if stopped successfully, False otherwise
        """
        if name not in self.servers:
            print(f"Error: Unknown server '{name}'")
            return False

        return await self.servers[name].stop()

    async def start_all(self) -> Dict[str, bool]:
        """
        Start all servers.

        Returns:
            Dict mapping server name to success status
        """
        results = {}
        for name in self.servers:
            results[name] = await self.start_server(name)
        return results

    async def stop_all(self) -> Dict[str, bool]:
        """
        Stop all servers.

        Returns:
            Dict mapping server name to success status
        """
        results = {}
        for name in self.servers:
            results[name] = await self.stop_server(name)
        return results

    def get_server(self, name: str) -> Optional[MCPServer]:
        """
        Get server by name.

        Args:
            name: Server name

        Returns:
            MCPServer instance or None
        """
        return self.servers.get(name)

    def get_all_tools(self) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get all tool definitions from all servers.

        Returns:
            Dict mapping server name to list of tool definitions
        """
        all_tools = {}
        for name, server in self.servers.items():
            all_tools[name] = server.get_tool_definitions()
        return all_tools
