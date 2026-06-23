# Copyright (c) 2025 Z-AXIS

"""
Prompt templates and utilities for agent system prompts.

This module provides:
- System prompt generation for MCP tool usage
- Agent-specific prompt generation (main agent, browsing agent)
- Summary prompt templates for final answer generation
- Failure experience templates for retry mechanisms
"""

# ============================================================================
# Format Error Messages
# ============================================================================

FORMAT_ERROR_MESSAGE = "No \\boxed{} content found in the final answer."

# ============================================================================
# Failure Experience Templates (for format error retry)
# ============================================================================

# Header that appears once before all failure experiences
FAILURE_EXPERIENCE_HEADER = """

=== Previous Attempts Analysis ===
The following summarizes what was tried before and why it didn't work. Use this to guide a NEW approach.

"""

# Template for each individual failure experience (used multiple times)
FAILURE_EXPERIENCE_ITEM = """[Attempt {attempt_number}]
{failure_summary}

"""

# Footer that appears once after all failure experiences
FAILURE_EXPERIENCE_FOOTER = """=== End of Analysis ===

Based on the above, you should try a different strategy this time.
"""

FAILURE_SUMMARY_PROMPT = """The task was not completed successfully. Do NOT call any tools. Provide a summary:

Failure type: [incomplete / blocked / misdirected]
  - incomplete: ran out of turns before finishing
  - blocked: got stuck due to tool failure or missing information
  - misdirected: went down the wrong path
What happened: [describe the approach taken and why a final answer was not reached]
Useful findings: [list any facts, intermediate results, or conclusions discovered that should be reused]"""

# Assistant prefix for failure summary generation (guides model to follow structured format)
FAILURE_SUMMARY_THINK_CONTENT = """We need to write a structured post-mortem style summary **without calling any tools**, explaining why the task was not completed, using these required sections:

* **Failure type**: pick one from **incomplete / blocked / misdirected**
* **What happened**: describe the approach taken and why it didn't reach a final answer
* **Useful findings**: list any facts, intermediate results, or conclusions that can be reused"""

FAILURE_SUMMARY_ASSISTANT_PREFIX = (
    f"<think>\n{FAILURE_SUMMARY_THINK_CONTENT}\n</think>\n\n"
)

# ============================================================================
# MCP Tags for Parsing
# ============================================================================

mcp_tags = [
    "<use_mcp_tool>",
    "</use_mcp_tool>",
    "<server_name>",
    "</server_name>",
    "<arguments>",
    "</arguments>",
]

refusal_keywords = [
    "time constraint",
    "I’m sorry, but I can’t",
    "I'm sorry, I cannot solve",
]


def generate_mcp_system_prompt(date, mcp_servers):
    """
    Generate the MCP (Model Context Protocol) system prompt for LLM.

    Creates a structured prompt that instructs the LLM on how to use available
    MCP tools. Includes tool definitions, XML formatting instructions, and
    general task-solving guidelines.

    Args:
        date: Current date object for timestamp inclusion
        mcp_servers: List of server definitions, each containing 'name' and 'tools'

    Returns:
        Complete system prompt string with tool definitions and usage instructions
    """
    formatted_date = date.strftime("%Y-%m-%d")

    # Concise MCP system prompt following Anthropic tool-use guidelines
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
    if mcp_servers and len(mcp_servers) > 0:
        for server in mcp_servers:
            template += f"\n## Server name: {server['name']}\n"

            if "tools" in server and len(server["tools"]) > 0:
                for tool in server["tools"]:
                    # Skip tools that failed to load (they only have 'error' key)
                    if "error" in tool and "name" not in tool:
                        continue
                    template += f"### Tool name: {tool['name']}\n"
                    template += f"Description: {tool['description']}\n"
                    template += f"Input JSON schema: {tool['schema']}\n"

    # Add the general objective from YAML config
    from ..prompt.prompt_loader import get_prompt_loader
    general_objective = get_prompt_loader().get_general_objective()
    template += general_objective

    return template


def generate_no_mcp_system_prompt(date):
    """
    Generate a minimal system prompt without MCP tool definitions.

    Used when no tools are available or when running in tool-less mode.

    Args:
        date: Current date object for timestamp inclusion

    Returns:
        Basic system prompt string without tool definitions
    """
    formatted_date = date.strftime("%Y-%m-%d")

    # Start building the template, now follows https://docs.anthropic.com/en/docs/build-with-claude/tool-use/overview#tool-use-system-prompt
    template = """In this environment you have access to a set of tools you can use to answer the user's question. """

    template += f" Today is: {formatted_date}\n"

    template += """
Important Notes:
- Tool-use must be placed **at the end** of your response, **top-level**, and not nested within other tags.
- Always adhere to this format for the tool use to ensure proper parsing and execution.

String and scalar parameters should be specified as is, while lists and objects should use JSON format. Note that spaces for string values are not stripped. The output is not expected to be valid XML and is parsed with regular expressions.
"""

    # Add the general objective from YAML config
    from ..prompt.prompt_loader import get_prompt_loader
    general_objective = get_prompt_loader().get_general_objective()
    template += general_objective

    return template


def generate_agent_specific_system_prompt(agent_type=""):
    """
    Generate agent-specific objective prompts based on agent type.

    Loads the agent-specific objective text from system.yaml config.
    Different agent types have different objectives:
    - main: Research agent that gathers and synthesizes information into structured reports
    - agent-browsing: Web search and browsing agent for information retrieval

    Args:
        agent_type: Type of agent ("main", "agent-browsing", or "browsing-agent")

    Returns:
        Agent-specific objective prompt string
    """
    from ..prompt.prompt_loader import get_prompt_loader
    loader = get_prompt_loader()

    if agent_type == "main":
        return loader.get_agent_objective("main").strip()
    elif agent_type == "agent-browsing" or agent_type == "browsing-agent":
        return loader.get_agent_objective("agent_browsing").strip()
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")


def generate_agent_summarize_prompt(task_description, agent_type="", task_type=None, company_name=None):
    """
    Generate the final summarization prompt for an agent.

    Creates prompts that instruct agents to summarize their work and provide
    final answers. Different agent types have different summarization formats:
    - main: Produces a comprehensive structured report of research findings
    - agent-browsing: Provides structured report of findings

    When agent_type is "main" and task_type is provided, the summary prompt
    is loaded from the task-specific YAML configuration, allowing different
    research tasks to have tailored summary instructions.

    Args:
        task_description: The original task/question to reference in the summary
        agent_type: Type of agent ("main" or "agent-browsing")
        task_type: Optional task type for YAML-based prompt loading
                   ("bg_check", "team_check", "industry_check")
        company_name: Optional company name (required for team_check)

    Returns:
        Summarization prompt string with formatting instructions
    """
    if agent_type == "main" and task_type:
        # Load task-specific summary prompt from YAML config
        from ..prompt.prompt_loader import get_prompt_loader
        return get_prompt_loader().get_summary_prompt(task_type, task_description, company_name)
    elif agent_type == "main":
        # Fallback: hardcoded summary prompt when no task_type provided
        summarize_prompt = (
            "This is a direct instruction to you (the assistant), not the result of a tool call.\n\n"
            "We are now ending this session. You must NOT initiate any further tool use. "
            "This is your final opportunity to report *all* of the information gathered during the session.\n\n"
            "The original task is repeated here for reference:\n\n"
            f'"{task_description}"\n\n'
            "Summarize all the research conducted above. Output a FINAL RESPONSE that includes detailed findings, supporting data, and source references.\n\n"
            "If you found any useful facts, data, quotes, or answers directly relevant to the original task, include them clearly and completely.\n"
            "If you reached a conclusion or answer, include it as part of the response.\n"
            "If the task could not be fully answered, do NOT make up any content. Instead, return all partially relevant findings, "
            "search results, quotes, and observations that were discovered.\n"
            "If partial, conflicting, or inconclusive information was found, clearly indicate this in your response.\n\n"
            "Your final response should be a clear, complete, and structured report in CHINESE.\n"
            "Organize the content into logical sections with appropriate headings.\n"
            "Include a section titled '## 📝 Final Summary' containing the key findings and conclusions.\n"
            "Do NOT include any tool call instructions, speculative filler, or vague summaries.\n"
            "Focus on factual, specific, and well-organized information.\n"
            "NEVER omit or condense any verified information."
        )
    elif agent_type == "agent-browsing":
        summarize_prompt = (
            "This is a direct instruction to you (the assistant), not the result of a tool call.\n\n"
            "We are now ending this session, and your conversation history will be deleted. "
            "You must NOT initiate any further tool use. This is your final opportunity to report "
            "*all* of the information gathered during the session.\n\n"
            "The original task is repeated here for reference:\n\n"
            f'"{task_description}"\n\n'
            "Summarize the above search and browsing history. Output the FINAL RESPONSE and detailed supporting information of the task given to you.\n\n"
            "If you found any useful facts, data, quotes, or answers directly relevant to the original task, include them clearly and completely.\n"
            "If you reached a conclusion or answer, include it as part of the response.\n"
            "If the task could not be fully answered, do NOT make up any content. Instead, return all partially relevant findings, "
            "Search results, quotes, and observations that might help a downstream agent solve the problem.\n"
            "If partial, conflicting, or inconclusive information was found, clearly indicate this in your response.\n\n"
            "Your final response should be a clear, complete, and structured report.\n"
            "Organize the content into logical sections with appropriate headings.\n"
            "Do NOT include any tool call instructions, speculative filler, or vague summaries.\n"
            "Focus on factual, specific, and well-organized information."
        )
    else:
        raise ValueError(f"Unknown agent type: {agent_type}")

    return summarize_prompt.strip()
