"""
MCP Gateway

Handles MCP protocol communication over stdio with MCP servers.
Implements JSON-RPC message passing for tool calls.
"""

import asyncio
import json
import uuid
from typing import Any, Dict, List, Optional

from servers import MCPServer, ServerManager


class MCPGateway:
    """
    Gateway for communicating with MCP servers via JSON-RPC over stdio.
    """

    def __init__(self, server_manager: ServerManager):
        """
        Initialize MCP Gateway.

        Args:
            server_manager: Server manager instance
        """
        self.server_manager = server_manager
        self._request_id = 0

    def _next_request_id(self) -> int:
        """Get next request ID"""
        self._request_id += 1
        return self._request_id

    async def _send_request(
        self,
        server: MCPServer,
        method: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Send JSON-RPC request to server and wait for response.

        Args:
            server: MCP server instance
            method: JSON-RPC method name
            params: Method parameters

        Returns:
            JSON-RPC response dict
        """
        request_id = self._next_request_id()

        # Build JSON-RPC request
        request = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": method,
        }

        if params:
            request["params"] = params

        # Send request
        request_str = json.dumps(request)
        await server.send(request_str)

        # Wait for response
        response_str = await server.receive()
        if not response_str:
            raise RuntimeError(f"No response from server '{server.name}'")

        # Parse response
        try:
            response = json.loads(response_str)
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Invalid JSON response from server '{server.name}': {e}")

        # Validate response
        if response.get("id") != request_id:
            raise RuntimeError(f"Response ID mismatch: expected {request_id}, got {response.get('id')}")

        return response

    async def initialize(self, server_name: str) -> Dict[str, Any]:
        """
        Initialize connection to MCP server.

        Args:
            server_name: Name of server to initialize

        Returns:
            Server capabilities
        """
        server = self.server_manager.get_server(server_name)
        if not server:
            raise ValueError(f"Server not found: {server_name}")

        if not server.is_running:
            raise RuntimeError(f"Server '{server_name}' is not running")

        # Send initialize request
        response = await self._send_request(
            server,
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {},
                },
                "clientInfo": {
                    "name": "mcp-e2e-test-runner",
                    "version": "1.0.0",
                },
            },
        )

        if "error" in response:
            raise RuntimeError(f"Initialize error: {response['error']}")

        # Send initialized notification
        await self._send_notification(server, "notifications/initialized")

        return response.get("result", {})

    async def list_tools(self, server_name: str) -> List[Dict[str, Any]]:
        """
        List available tools from MCP server.

        Args:
            server_name: Name of server

        Returns:
            List of tool definitions
        """
        server = self.server_manager.get_server(server_name)
        if not server:
            raise ValueError(f"Server not found: {server_name}")

        response = await self._send_request(server, "tools/list")

        if "error" in response:
            raise RuntimeError(f"List tools error: {response['error']}")

        return response.get("result", {}).get("tools", [])

    async def call_tool(
        self,
        server_name: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Call a tool on MCP server.

        Args:
            server_name: Name of server
            tool_name: Name of tool to call
            arguments: Tool arguments

        Returns:
            Tool execution result
        """
        server = self.server_manager.get_server(server_name)
        if not server:
            raise ValueError(f"Server not found: {server_name}")

        response = await self._send_request(
            server,
            "tools/call",
            {
                "name": tool_name,
                "arguments": arguments,
            },
        )

        if "error" in response:
            error = response["error"]
            raise RuntimeError(f"Tool call error: {error.get('message', 'Unknown error')}")

        return response.get("result", {})

    async def _send_notification(
        self,
        server: MCPServer,
        method: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Send JSON-RPC notification (no response expected).

        Args:
            server: MCP server instance
            method: Notification method name
            params: Notification parameters
        """
        notification = {
            "jsonrpc": "2.0",
            "method": method,
        }

        if params:
            notification["params"] = params

        # Send notification (no response expected)
        notification_str = json.dumps(notification)
        await server.send(notification_str)

    async def initialize_all(self) -> Dict[str, Dict[str, Any]]:
        """
        Initialize all servers and get their capabilities.

        Returns:
            Dict mapping server name to capabilities
        """
        capabilities = {}
        for server_name in self.server_manager.servers:
            try:
                caps = await self.initialize(server_name)
                capabilities[server_name] = caps
            except Exception as e:
                print(f"Error initializing server '{server_name}': {e}")
                capabilities[server_name] = {"error": str(e)}
        return capabilities

    async def execute_tool_call(
        self,
        server_name: str,
        tool_name: str,
        arguments: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Execute a tool call with full error handling.

        Args:
            server_name: Name of server
            tool_name: Name of tool to call
            arguments: Tool arguments

        Returns:
            Tool execution result with status
        """
        try:
            result = await self.call_tool(server_name, tool_name, arguments)
            return {
                "success": True,
                "server": server_name,
                "tool": tool_name,
                "result": result,
            }
        except Exception as e:
            return {
                "success": False,
                "server": server_name,
                "tool": tool_name,
                "error": str(e),
            }

    def parse_tool_call(self, tool_call_xml: str) -> Dict[str, Any]:
        """
        Parse tool call from MCP XML format.

        Expected format:
        <use_mcp_tool>
        <server_name>imaudio</server_name>
        <tool_name>soundstage_read</tool_name>
        <arguments>
        {"param1": "value1"}
        </arguments>
        </use_mcp_tool>

        Args:
            tool_call_xml: XML string containing tool call

        Returns:
            Parsed tool call dict with keys: server_name, tool_name, arguments
        """
        import re

        # Extract components using regex
        pattern = r"<use_mcp_tool>\s*<server_name>(.*?)</server_name>\s*<tool_name>(.*?)</tool_name>\s*<arguments>\s*([\s\S]*?)\s*</arguments>\s*</use_mcp_tool>"
        match = re.search(pattern, tool_call_xml, re.DOTALL)

        if not match:
            raise ValueError("Invalid tool call format")

        server_name = match.group(1).strip()
        tool_name = match.group(2).strip()
        arguments_str = match.group(3).strip()

        # Parse arguments JSON
        try:
            arguments = json.loads(arguments_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid arguments JSON: {e}")

        return {
            "server_name": server_name,
            "tool_name": tool_name,
            "arguments": arguments,
        }

    def format_tool_result(self, result: Dict[str, Any]) -> str:
        """
        Format tool result for LLM.

        Args:
            result: Tool execution result

        Returns:
            Formatted result string
        """
        if result.get("success"):
            tool_result = result.get("result", {})
            return f"Tool '{result['tool']}' on server '{result['server']}' executed successfully. Result: {json.dumps(tool_result, ensure_ascii=False)}"
        else:
            return f"Tool '{result['tool']}' on server '{result['server']}' failed. Error: {result.get('error', 'Unknown error')}"
