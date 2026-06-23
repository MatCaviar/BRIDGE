"""
Prompt Generator

Converts analysis.json files to MCP system prompt format.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List


def generate_mcp_system_prompt(analysis_configs: List[Dict[str, Any]]) -> str:
    """
    Generate MCP system prompt from analysis.json files.

    Creates a structured prompt that instructs the LLM on how to use available
    MCP tools. Includes tool definitions, XML formatting instructions.

    Args:
        analysis_configs: List of analysis data dicts, each containing:
            - app: App metadata
            - capabilities: List of tool definitions
            - enums: Enum definitions
            - errorCodes: Error code definitions

    Returns:
        Complete system prompt string with tool definitions and usage instructions
    """
    formatted_date = datetime.now().strftime("%Y-%m-%d")

    # MCP system prompt template
    template = f"""Today is: {formatted_date}

You have access to tools via MCP (Model Context Protocol). Use one tool per message, receive results in the next response.

Format:
<use_mcp_tool>
<server_name>server name here</server_name>
<tool_name>tool name here</tool_name>
<arguments>
{{
"param1": "value1",
"param2": "value2 \\"escaped string\\""
}}
</arguments>
</use_mcp_tool>

Rules: Tool-use must be at the **end** of your response, **top-level**. String/scalar params as-is, lists/objects as JSON. Here are the available tools:

"""

    # Add MCP servers section
    for analysis in analysis_configs:
        app = analysis.get("app", {})
        server_name = app.get("name", "unknown")
        capabilities = analysis.get("capabilities", [])

        template += f"\n## Server name: {server_name}\n"

        # Add tools
        for cap in capabilities:
            tool_id = cap.get("id", "unknown")
            tool_description = _describe_tool(cap)
            tool_schema = _build_tool_schema(cap)

            template += f"### Tool name: {tool_id}\n"
            template += f"Description: {tool_description}\n"
            template += f"Input JSON schema: {json.dumps(tool_schema, ensure_ascii=False)}\n\n"

        # Add enum definitions
        enums = analysis.get("enums", {})
        if enums:
            template += f"### Enum definitions for {server_name}:\n"
            for enum_name, enum_def in enums.items():
                values = enum_def.get("values", [])
                value_type = enum_def.get("type", "string")
                template += f"- {enum_name} ({value_type}): {', '.join(str(v) for v in values)}\n"
            template += "\n"

    # Add general instructions
    template += """
## General Instructions

1. **Answering capability questions**: When users ask "what can you do", "what tools do you have", or similar questions, provide a clear summary of available tools and their purposes WITHOUT calling any tools. Group tools by server and explain what each tool does.

2. **Using tools**: For actual task execution (e.g., "check system status", "set volume", "navigate to page"), use the appropriate tool with correct parameters.

3. Always use the exact **server name** and **tool name** as listed above — copy them verbatim, character-for-character, case-sensitive (e.g. the server is "imaudio", never "aimaudio" or any other variant).
4. For enum parameters, use the exact value from the enum definition.
5. If a tool call fails, analyze the error and try again with corrected parameters.
6. Use one tool per message. Wait for the result before calling another tool.
7. When you have enough information to answer the user's question, provide a clear and concise response.

## Error Handling

If a tool call fails:
- Check if the error is due to invalid parameters
- Verify the tool name is correct
- Ensure required parameters are provided
- Try again with corrected parameters

If you cannot complete the task after 3 attempts, summarize what you tried and what information you were able to gather.
"""

    return template


def _describe_tool(capability: Dict[str, Any]) -> str:
    """
    Generate human-readable tool description.

    Args:
        capability: Capability definition from analysis.json

    Returns:
        Tool description string
    """
    action = capability.get("action", "")
    object_name = capability.get("object", "")

    # Convert action to readable form
    action_words = action.replace("_", " ")
    description = f"{action_words} {object_name.replace('_', ' ')}"

    return description.capitalize()


def _build_tool_schema(capability: Dict[str, Any]) -> Dict[str, Any]:
    """
    Build JSON schema for tool parameters.

    Args:
        capability: Capability definition from analysis.json

    Returns:
        JSON schema for tool parameters
    """
    params = capability.get("params", [])

    if not params:
        return {}

    schema = {
        "type": "object",
        "properties": {},
    }

    required_params = []

    for param in params:
        param_name = param.get("name", "")
        param_type = param.get("type", "string")
        param_optional = param.get("optional", False)
        param_enum = param.get("enum", [])

        # Build property schema
        prop_schema = {"type": param_type}

        if param_enum:
            prop_schema["enum"] = param_enum

        schema["properties"][param_name] = prop_schema

        if not param_optional:
            required_params.append(param_name)

    if required_params:
        schema["required"] = required_params

    return schema


def load_analysis_json(path: str, base_dir: str | Path = None) -> Dict[str, Any]:
    """
    Load analysis.json file.

    Args:
        path: Path to analysis.json file (relative or absolute)
        base_dir: Base directory for resolving relative paths (defaults to current script directory)

    Returns:
        Analysis data dict
    """
    # If base_dir not provided, use the e2e-test-runner directory
    if base_dir is None:
        base_dir = Path(__file__).parent.resolve()
    else:
        base_dir = Path(base_dir).resolve()

    analysis_path = Path(path)
    if not analysis_path.is_absolute():
        # Resolve relative to base_dir
        analysis_path = (base_dir / analysis_path).resolve()

    if not analysis_path.exists():
        raise FileNotFoundError(f"Analysis file not found: {analysis_path}")

    with open(analysis_path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_all_from_servers(servers_config: str | list | Dict[str, Any] = "servers.json", base_dir: str | Path = None) -> List[Dict[str, Any]]:
    """
    Load all analysis.json files from servers config.

    Args:
        servers_config: Can be:
            - Path to servers.json (str)
            - List of server configs (from YAML)
            - Dict with "servers" key

    Returns:
        List of analysis data dicts
    """
    # If base_dir not provided, use the e2e-test-runner directory
    if base_dir is None:
        base_dir = Path(__file__).parent.resolve()

    server_configs = []

    if isinstance(servers_config, str):
        # Load from JSON file
        config_path = Path(servers_config)
        if not config_path.is_absolute():
            config_path = (Path(base_dir) / config_path).resolve()
        if not config_path.exists():
            raise FileNotFoundError(f"Servers config not found: {config_path}")

        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        server_configs = data.get("servers", [])

    elif isinstance(servers_config, dict):
        # Direct dict (from YAML config)
        server_configs = servers_config.get("servers", [])

    elif isinstance(servers_config, list):
        # Direct list of server configs
        server_configs = servers_config

    else:
        raise TypeError(f"Invalid config type: {type(servers_config)}")

    analyses = []
    for server_config in server_configs:
        analysis_json = server_config.get("analysis_json")
        if analysis_json:
            try:
                analysis = load_analysis_json(analysis_json, base_dir=base_dir)
                analyses.append(analysis)
            except Exception as e:
                print(f"Warning: Failed to load analysis from {analysis_json}: {e}")

    return analyses


def generate_system_prompt_from_servers(servers_config: str | list | Dict[str, Any] = "servers.json") -> str:
    """
    Generate MCP system prompt from all servers in config.

    Args:
        servers_config: Can be:
            - Path to servers.json (str)
            - List of server configs (from YAML)
            - Dict with "servers" key (from YAML)

    Returns:
        Complete system prompt string
    """
    analyses = load_all_from_servers(servers_config)
    return generate_mcp_system_prompt(analyses)


if __name__ == "__main__":
    # Test: Generate system prompt from servers config
    prompt = generate_system_prompt_from_servers()
    print(prompt)
