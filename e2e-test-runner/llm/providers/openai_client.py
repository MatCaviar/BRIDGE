# Copyright (c) 2025 Z-AXIS

"""
OpenAI-compatible LLM client implementation.

This module provides the OpenAIClient class for interacting with OpenAI's API
and OpenAI-compatible endpoints (such as vLLM, Qwen, DeepSeek, etc.).

Features:
- Async and sync API support
- Automatic retry with exponential backoff
- Token usage tracking and context length management
- MCP tool call parsing and response processing
- Prompt caching for system prompts
"""

import asyncio
import dataclasses
import hashlib
import logging
import os
import re
from typing import Any, Dict, List, Tuple, Union
from urllib.parse import quote

import tiktoken
import httpx as _httpx
from openai import AsyncOpenAI, DefaultAsyncHttpxClient, DefaultHttpxClient, OpenAI

# HTTP client timeout: connect 30s, read 1200s (merged dimension analysis can generate 50K+ tokens
# requiring 10-15 minutes for GLM-5; 1200s covers worst-case generation while still failing fast on genuine errors)
_HTTPX_TIMEOUT = _httpx.Timeout(connect=30.0, read=1200.0, write=60.0, pool=30.0)

from utils.prompt_utils import generate_mcp_system_prompt
from llm.base_client import BaseClient

logger = logging.getLogger("zaxis_agent")


# Default sensitive keywords that trigger content inspection errors
# Can be overridden via config or environment variable
DEFAULT_SENSITIVE_KEYWORDS = [
    "白纸运动",
    "白纸革命",
    "白紙運動",
    "白紙革命",
]


def _get_sensitive_keywords(cfg) -> List[str]:
    """
    Get sensitive keywords from config, environment variable, or defaults.

    Priority:
    1. Config file: llm.sensitive_keywords
    2. Environment variable: SENSITIVE_KEYWORDS (comma-separated)
    3. Default list: DEFAULT_SENSITIVE_KEYWORDS

    Returns:
        List of sensitive keywords to filter
    """
    # Try config file first
    try:
        if hasattr(cfg, 'llm') and hasattr(cfg.llm, 'sensitive_keywords'):
            config_keywords = cfg.llm.sensitive_keywords
            if config_keywords and isinstance(config_keywords, list):
                return config_keywords
    except Exception:
        pass

    # Try environment variable
    env_keywords = os.getenv("SENSITIVE_KEYWORDS", "")
    if env_keywords:
        # Split by comma and strip whitespace
        return [k.strip() for k in env_keywords.split(",") if k.strip()]

    # Fall back to defaults
    return DEFAULT_SENSITIVE_KEYWORDS


class PromptCacheManager:
    """
    Manages prompt caching for LLM system prompts.

    Tracks system prompts and their cache keys to enable prompt caching
    with compatible LLM providers (like OpenAI and Qwen).
    """

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._enabled = True

    def get_cache_key(self, system_prompt: str) -> str:
        """
        Generate a cache key for the system prompt.

        Args:
            system_prompt: The system prompt to cache

        Returns:
            A hash-based cache key
        """
        return hashlib.sha256(system_prompt.encode()).hexdigest()[:16]

    def is_cached(self, system_prompt: str) -> bool:
        """Check if a system prompt is already cached."""
        cache_key = self.get_cache_key(system_prompt)
        return cache_key in self._cache

    def mark_cached(self, system_prompt: str, metadata: Dict[str, Any] = None):
        """
        Mark a system prompt as cached.

        Args:
            system_prompt: The system prompt that was cached
            metadata: Optional metadata about the caching operation
        """
        cache_key = self.get_cache_key(system_prompt)
        self._cache[cache_key] = {
            "prompt_length": len(system_prompt),
            "cached_at": asyncio.get_event_loop().time(),
            "metadata": metadata or {},
        }

    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        total_cached = sum(item["prompt_length"] for item in self._cache.values())
        return {
            "cached_prompts": len(self._cache),
            "total_cached_chars": total_cached,
            "estimated_tokens": total_cached // 4,  # Rough estimate
        }

    def enable(self):
        """Enable prompt caching."""
        self._enabled = True

    def disable(self):
        """Disable prompt caching."""
        self._enabled = False


# Global cache manager instance
_prompt_cache_manager = PromptCacheManager()


def get_prompt_cache_manager() -> PromptCacheManager:
    """Get the global prompt cache manager instance."""
    return _prompt_cache_manager


def _sanitize_content(content: str, sensitive_keywords: List[str]) -> Tuple[str, List[str]]:
    """
    Sanitize content by removing sensitive keywords.

    Args:
        content: The content to sanitize
        sensitive_keywords: List of keywords to remove

    Returns:
        Tuple of (sanitized_content, removed_keywords_list)
    """
    if not sensitive_keywords or not content:
        return content, []

    removed = []
    sanitized = content

    for keyword in sensitive_keywords:
        if keyword in sanitized:
            removed.append(keyword)
            # Replace with placeholder to maintain structure
            sanitized = sanitized.replace(keyword, "[已过滤]")

    return sanitized, removed


@dataclasses.dataclass
class OpenAIClient(BaseClient):
    def _create_client(self) -> Union[AsyncOpenAI, OpenAI]:
        """Create LLM client with optimized HTTP configuration"""
        # URL-encode task_id to make it ASCII-safe for HTTP headers
        safe_task_id = quote(self.task_id, safe='')

        # Optimized HTTP client configuration for low-latency environment
        http_client_args = {
            "headers": {"x-upstream-session-id": safe_task_id},
            "timeout": _HTTPX_TIMEOUT,
            # HTTP/2 support for connection multiplexing
            "http2": True,
            # Connection pool settings
            "limits": _httpx.Limits(
                max_connections=10,      # Maximum concurrent connections
                max_keepalive_connections=5,  # Maximum kept-alive connections
                keepalive_expiry=30.0,    # Keep-alive expiration in seconds
            ),
        }
        if self.async_client:
            return AsyncOpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                http_client=DefaultAsyncHttpxClient(**http_client_args),
                timeout=1200.0,  # SDK-level timeout (seconds)
                max_retries=0,  # Let application handle retries
            )
        else:
            return OpenAI(
                api_key=self.api_key,
                base_url=self.base_url,
                http_client=DefaultHttpxClient(**http_client_args),
                timeout=1200.0,
                max_retries=0,
            )

    def _update_token_usage(self, usage_data: Any) -> None:
        """Update cumulative token usage"""
        if usage_data:
            input_tokens = getattr(usage_data, "prompt_tokens", 0)
            output_tokens = getattr(usage_data, "completion_tokens", 0)
            prompt_tokens_details = getattr(usage_data, "prompt_tokens_details", None)
            if prompt_tokens_details:
                cached_tokens = (
                    getattr(prompt_tokens_details, "cached_tokens", None) or 0
                )
            else:
                cached_tokens = 0

            # Record token usage for the most recent call
            self.last_call_tokens = {
                "prompt_tokens": input_tokens,
                "completion_tokens": output_tokens,
            }

            # OpenAI does not provide cache_creation_input_tokens
            self.token_usage["total_input_tokens"] += input_tokens
            self.token_usage["total_output_tokens"] += output_tokens
            self.token_usage["total_cache_read_input_tokens"] += cached_tokens

            self.task_log.log_step(
                "info",
                "LLM | Token Usage",
                f"Input: {self.token_usage['total_input_tokens']}, "
                f"Output: {self.token_usage['total_output_tokens']}",
            )

    async def _stream_and_collect(self, params: dict, stream_label: str = "", on_token: callable = None):
        """
        Stream LLM response and collect into a response-like object.

        With streaming, the read_timeout applies per-chunk rather than
        per-total-response, so long-generation calls (e.g. merged dimension
        analysis producing 50K+ tokens) won't be killed by read_timeout.

        Args:
            params: API request parameters
            stream_label: Label for progress tracking (currently unused, reserved for future)
            on_token: Optional callback for each token (token_content)
        """
        stream = await self.client.chat.completions.create(**params)

        collected_content = []
        finish_reason = None
        usage_data = None

        async for chunk in stream:
            if chunk.choices and chunk.choices[0]:
                delta = chunk.choices[0].delta
                if delta and delta.content:
                    token_content = delta.content
                    collected_content.append(token_content)
                    # Call the token callback if provided
                    if on_token:
                        on_token(token_content)
                if chunk.choices[0].finish_reason:
                    finish_reason = chunk.choices[0].finish_reason
            if hasattr(chunk, 'usage') and chunk.usage:
                usage_data = chunk.usage

        # Construct response-like object compatible with non-streaming code path
        full_content = "".join(collected_content)

        class _Message:
            def __init__(self, content):
                self.content = content

        class _Choice:
            def __init__(self, message, finish_reason):
                self.message = message
                self.finish_reason = finish_reason

        class _Response:
            def __init__(self, choices, usage=None):
                self.choices = choices
                self.usage = usage

        return _Response(
            choices=[_Choice(_Message(full_content), finish_reason)],
            usage=usage_data,
        )

    async def _create_message(
        self,
        system_prompt: str,
        messages_history: List[Dict[str, Any]],
        tools_definitions,
        keep_tool_result: int = -1,
        stream: bool = False,
        stream_label: str = "",
        on_token: callable = None,
    ):
        """
        Send message to OpenAI API.
        :param system_prompt: System prompt string.
        :param messages_history: Message history list.
        :param stream_label: Label for streaming progress bar (empty = no progress).
        :param on_token: Optional callback for each token during streaming.
        :return: OpenAI API response object or None (if error occurs).
        """

        # Create a copy for sending to LLM (to avoid modifying the original)
        messages_for_llm = [m.copy() for m in messages_history]

        # put the system prompt in the first message since OpenAI API does not support system prompt in
        if system_prompt:
            # Check if there's already a system or developer message
            if messages_for_llm and messages_for_llm[0]["role"] in [
                "system",
                "developer",
            ]:
                messages_for_llm[0] = {
                    "role": "system",
                    "content": system_prompt,
                }

            else:
                messages_for_llm.insert(
                    0,
                    {
                        "role": "system",
                        "content": system_prompt,
                    },
                )

        # Filter tool results to save tokens (only affects messages sent to LLM)
        messages_for_llm = self._remove_tool_result_from_messages(
            messages_for_llm, keep_tool_result
        )

        # Check prompt caching status
        cache_manager = get_prompt_cache_manager()
        is_first_request = not cache_manager.is_cached(system_prompt)

        if is_first_request:
            cache_manager.mark_cached(system_prompt)
            self.task_log.log_step(
                "info",
                "LLM | Prompt Cache",
                f"First request - system prompt will be cached (~{len(system_prompt)//4} tokens)",
            )

        # Sanitize content by removing sensitive keywords
        sensitive_keywords = _get_sensitive_keywords(self.cfg)
        if sensitive_keywords:
            total_removed = []
            for msg in messages_for_llm:
                if "content" in msg and isinstance(msg["content"], str):
                    sanitized, removed = _sanitize_content(msg["content"], sensitive_keywords)
                    if removed:
                        msg["content"] = sanitized
                        total_removed.extend(removed)

            if total_removed:
                self.task_log.log_step(
                    "warning",
                    "LLM | Content Sanitized",
                    f"Removed {len(total_removed)} sensitive keyword(s) from message: {total_removed}",
                )

        # Retry loop with dynamic max_tokens adjustment
        max_retries = 5
        base_wait_time = 15
        current_max_tokens = self.max_tokens
        consecutive_connection_errors = 0

        for attempt in range(max_retries):
            # Exponential backoff: 15s, 30s, 60s, 120s, 240s
            if attempt > 0:
                wait_time = min(base_wait_time * (2 ** (attempt - 1)), 300)
                await asyncio.sleep(wait_time)
            params = {
                "model": self.model_name,
                "temperature": self.temperature,
                "messages": messages_for_llm,
                "stream": stream,
                "top_p": self.top_p,
                "extra_body": {},
            }
            # Check if the model is GPT-5, and adjust the parameter accordingly
            if "gpt-5" in self.model_name:
                # Use 'max_completion_tokens' for GPT-5
                params["max_completion_tokens"] = current_max_tokens
            else:
                # Use 'max_tokens' for GPT-4 and other models
                params["max_tokens"] = current_max_tokens

            # Add repetition_penalty if it's not the default value
            if self.repetition_penalty != 1.0:
                params["extra_body"]["repetition_penalty"] = self.repetition_penalty

            if "deepseek-v3-1" in self.model_name:
                params["extra_body"]["thinking"] = {"type": "enabled"}

            # Handle thinking mode for Qwen3.5 models (SiliconFlow enables thinking by default)
            if self.thinking_mode == "disabled":
                params["extra_body"]["enable_thinking"] = False

            # auto-detect if we need to continue from the last assistant message
            if messages_for_llm and messages_for_llm[-1].get("role") == "assistant":
                params["extra_body"]["continue_final_message"] = True
                params["extra_body"]["add_generation_prompt"] = False

            try:
                if stream and self.async_client:
                    try:
                        response = await self._stream_and_collect(params, stream_label=stream_label, on_token=on_token)
                    finally:
                        pass  # Progress tracking removed
                elif self.async_client:
                    response = await self.client.chat.completions.create(**params)
                else:
                    response = self.client.chat.completions.create(**params)
                # Update token count
                self._update_token_usage(getattr(response, "usage", None))
                self.task_log.log_step(
                    "info",
                    "LLM | Response Status",
                    f"{getattr(response.choices[0], 'finish_reason', 'N/A')}",
                )

                # Check if response was truncated due to length limit
                finish_reason = getattr(response.choices[0], "finish_reason", None)
                if finish_reason == "length":
                    # If this is not the last retry, increase max_tokens and retry
                    if attempt < max_retries - 1:
                        # Increase max_tokens by 10%
                        current_max_tokens = int(current_max_tokens * 1.1)
                        self.task_log.log_step(
                            "warning",
                            "LLM | Length Limit Reached",
                            f"Response was truncated due to length limit (attempt {attempt + 1}/{max_retries}). Increasing max_tokens to {current_max_tokens} and retrying...",
                        )
                        continue
                    else:
                        # Last retry, return the truncated response instead of raising exception
                        self.task_log.log_step(
                            "warning",
                            "LLM | Length Limit Reached - Returning Truncated Response",
                            f"Response was truncated after {max_retries} attempts. Returning truncated response to allow ReAct loop to continue.",
                        )
                        # Return the truncated response and let the orchestrator handle it
                        return response, messages_history

                # Check if the last 50 characters of the response appear more than 5 times in the response content.
                # If so, treat it as a severe repeat and trigger a retry.
                if hasattr(response.choices[0], "message") and hasattr(
                    response.choices[0].message, "content"
                ):
                    resp_content = response.choices[0].message.content or ""
                else:
                    resp_content = getattr(response.choices[0], "text", "")

                if resp_content and len(resp_content) >= 50:
                    tail_50 = resp_content[-50:]
                    repeat_count = resp_content.count(tail_50)
                    if repeat_count > 5:
                        # If this is not the last retry, retry
                        if attempt < max_retries - 1:
                            self.task_log.log_step(
                                "warning",
                                "LLM | Repeat Detected",
                                f"Severe repeat: the last 50 chars appeared over 5 times (attempt {attempt + 1}/{max_retries}), retrying...",
                            )
                            continue
                        else:
                            # Last retry, return anyway
                            self.task_log.log_step(
                                "warning",
                                "LLM | Repeat Detected - Returning Anyway",
                                f"Severe repeat detected after {max_retries} attempts. Returning response anyway.",
                            )

                # Success - return the original messages_history (not the filtered copy)
                # This ensures that the complete conversation history is preserved in logs
                return response, messages_history

            except asyncio.TimeoutError as e:
                if attempt < max_retries - 1:
                    self.task_log.log_step(
                        "warning",
                        "LLM | Timeout Error",
                        f"Timeout error (attempt {attempt + 1}/{max_retries}): {str(e)}, retrying...",
                    )
                    continue
                else:
                    self.task_log.log_step(
                        "error",
                        "LLM | Timeout Error",
                        f"Timeout error after {max_retries} attempts: {str(e)}",
                    )
                    raise e
            except asyncio.CancelledError as e:
                self.task_log.log_step(
                    "error",
                    "LLM | Request Cancelled",
                    f"Request was cancelled: {str(e)}",
                )
                raise e
            except Exception as e:
                error_str = str(e)

                # Context length error - don't retry
                if "Error code: 400" in error_str and "longer than the model" in error_str:
                    self.task_log.log_step(
                        "error",
                        "LLM | Context Length Error",
                        f"Error: {error_str}",
                    )
                    raise e

                # Content inspection error (inappropriate content) - don't retry, as content won't change
                if "data_inspection_failed" in error_str or "inappropriate content" in error_str:
                    self.task_log.log_step(
                        "error",
                        "LLM | Content Inspection Error",
                        f"Content inspection failed (will not retry): {error_str[:500]}",
                    )
                    # Log the problematic content for debugging
                    self.task_log.log_step(
                        "error",
                        "LLM | Last User Message",
                        f"Last user message content: {(messages_for_llm[-1].get('content', '')[:] if messages_for_llm else 'None')}",
                    )
                    raise e

                # Connection error - fast fail after 3 consecutive connection errors
                is_connection_error = "Connection error" in error_str or "connection" in error_str.lower()
                if is_connection_error:
                    consecutive_connection_errors += 1
                    if consecutive_connection_errors >= 3:
                        self.task_log.log_step(
                            "error",
                            "LLM | Connection Error",
                            f"Fast-fail: {consecutive_connection_errors} consecutive connection errors. Last error: {error_str[:300]}",
                        )
                        raise e
                else:
                    consecutive_connection_errors = 0

                # Other errors - retry
                if attempt < max_retries - 1:
                    self.task_log.log_step(
                        "warning",
                        "LLM | API Error",
                        f"Error (attempt {attempt + 1}/{max_retries}): {error_str[:500]}, retrying...",
                    )
                    continue
                else:
                    self.task_log.log_step(
                        "error",
                        "LLM | API Error",
                        f"Error after {max_retries} attempts: {error_str[:500]}",
                    )
                    raise e

        # Should never reach here, but just in case
        raise Exception("Unexpected error: retry loop completed without returning")

    def process_llm_response(
        self, llm_response: Any, message_history: List[Dict], agent_type: str = "main"
    ) -> tuple[str, bool, List[Dict]]:
        """Process LLM response"""
        if not llm_response or not llm_response.choices:
            error_msg = "LLM did not return a valid response."
            self.task_log.log_step(
                "error", "LLM | Response Error", f"Error: {error_msg}"
            )
            return "", True, message_history  # Exit loop, return message_history

        # Extract LLM response text
        if llm_response.choices[0].finish_reason == "stop":
            assistant_response_text = llm_response.choices[0].message.content or ""

            message_history.append(
                {"role": "assistant", "content": assistant_response_text}
            )

        elif llm_response.choices[0].finish_reason == "length":
            assistant_response_text = llm_response.choices[0].message.content or ""
            if assistant_response_text == "":
                assistant_response_text = "LLM response is empty."
            elif "Context length exceeded" in assistant_response_text:
                # This is the case where context length is exceeded, needs special handling
                self.task_log.log_step(
                    "warning",
                    "LLM | Context Length",
                    "Detected context length exceeded, returning error status",
                )
                message_history.append(
                    {"role": "assistant", "content": assistant_response_text}
                )
                return (
                    assistant_response_text,
                    True,
                    message_history,
                )  # Return True to indicate need to exit loop

            # Add assistant response to history
            message_history.append(
                {"role": "assistant", "content": assistant_response_text}
            )

        else:
            raise ValueError(
                f"Unsupported finish reason: {llm_response.choices[0].finish_reason}"
            )

        return assistant_response_text, False, message_history

    def extract_tool_calls_info(
        self, llm_response: Any, assistant_response_text: str
    ) -> List[Dict]:
        """Extract tool call information from LLM response"""
        from utils.parsing_utils import parse_llm_response_for_tool_calls

        return parse_llm_response_for_tool_calls(assistant_response_text)

    def update_message_history(
        self, message_history: List[Dict], all_tool_results_content_with_id: List[Tuple]
    ) -> List[Dict]:
        """Update message history with tool calls data (llm client specific)"""

        merged_text = "\n".join(
            [
                item[1]["text"]
                for item in all_tool_results_content_with_id
                if item[1]["type"] == "text"
            ]
        )

        message_history.append(
            {
                "role": "user",
                "content": merged_text,
            }
        )

        return message_history

    def generate_agent_system_prompt(self, date: Any, mcp_servers: List[Dict]) -> str:
        return generate_mcp_system_prompt(date, mcp_servers)

    def _estimate_tokens(self, text: str) -> int:
        """Use tiktoken to estimate the number of tokens in text"""
        if not hasattr(self, "encoding"):
            # Initialize tiktoken encoder
            try:
                self.encoding = tiktoken.get_encoding("o200k_base")
            except Exception:
                # If o200k_base is not available, use cl100k_base as fallback
                self.encoding = tiktoken.get_encoding("cl100k_base")

        try:
            return len(self.encoding.encode(text))
        except Exception as e:
            # If encoding fails, use simple estimation: approximately 1 token per 4 characters
            self.task_log.log_step(
                "error",
                "LLM | Token Estimation Error",
                f"Error: {str(e)}",
            )
            return len(text) // 4

    def ensure_summary_context(
        self, message_history: list, summary_prompt: str
    ) -> tuple[bool, list]:
        """
        Check if current message_history + summary_prompt will exceed context
        If it will exceed, remove the last assistant-user pair and return False
        Return True to continue, False if messages have been rolled back
        """
        # Get token usage from the last LLM call
        last_prompt_tokens = self.last_call_tokens.get("prompt_tokens", 0)
        last_completion_tokens = self.last_call_tokens.get("completion_tokens", 0)
        buffer_factor = 1.5

        # Calculate token count for summary prompt
        summary_tokens = int(self._estimate_tokens(summary_prompt) * buffer_factor)

        # Calculate token count for the last user message in message_history
        last_user_tokens = 0
        if message_history[-1]["role"] == "user":
            content = message_history[-1]["content"]
            last_user_tokens = int(self._estimate_tokens(str(content)) * buffer_factor)

        # Calculate total token count: last prompt + completion + last user message + summary + reserved response space
        estimated_total = (
            last_prompt_tokens
            + last_completion_tokens
            + last_user_tokens
            + summary_tokens
            + self.max_tokens
            + 1000  # Add 1000 tokens as buffer
        )

        if estimated_total >= self.max_context_length:
            self.task_log.log_step(
                "info",
                "LLM | Context Limit Reached",
                "Context limit reached, proceeding to step back and summarize the conversation",
            )

            # Remove the last user message (tool call results)
            if message_history[-1]["role"] == "user":
                message_history.pop()

            # Remove the second-to-last assistant message (tool call request)
            if message_history[-1]["role"] == "assistant":
                message_history.pop()

            self.task_log.log_step(
                "info",
                "LLM | Context Limit Reached",
                f"Removed the last assistant-user pair, current message_history length: {len(message_history)}",
            )

            return False, message_history

        self.task_log.log_step(
            "info",
            "LLM | Context Limit Not Reached",
            f"{estimated_total}/{self.max_context_length}",
        )
        return True, message_history

    async def warmup_connection(self) -> bool:
        """
        Warm up the HTTP connection with a lightweight request.

        This reduces latency for the first actual request by establishing
        the connection and HTTP/2 session ahead of time.

        Returns:
            True if warmup succeeded, False otherwise
        """
        try:
            # Send a minimal request to warm up the connection
            # We use models list endpoint which is lightweight
            await self.client.models.list()
            self.task_log.log_step(
                "info",
                "LLM | Connection",
                "HTTP connection warmed up successfully",
            )
            return True
        except Exception as e:
            self.task_log.log_step(
                "warning",
                "LLM | Connection Warmup",
                f"Warmup failed (non-fatal): {str(e)[:100]}",
            )
            return False

    def format_token_usage_summary(self) -> tuple[List[str], str]:
        """Format token usage statistics, return summary_lines for format_final_summary and log string"""
        token_usage = self.get_token_usage()

        total_input = token_usage.get("total_input_tokens", 0)
        total_output = token_usage.get("total_output_tokens", 0)
        cache_input = token_usage.get("total_cache_input_tokens", 0)

        summary_lines = []
        summary_lines.append("\n" + "-" * 20 + " Token Usage " + "-" * 20)
        summary_lines.append(f"Total Input Tokens: {total_input}")
        summary_lines.append(f"Total Cache Input Tokens: {cache_input}")
        summary_lines.append(f"Total Output Tokens: {total_output}")
        summary_lines.append("-" * (40 + len(" Token Usage ")))
        summary_lines.append("Pricing is disabled - no cost information available")
        summary_lines.append("-" * (40 + len(" Token Usage ")))

        # Generate log string
        log_string = (
            f"[{self.model_name}] Total Input: {total_input}, "
            f"Cache Input: {cache_input}, "
            f"Output: {total_output}"
        )

        return summary_lines, log_string

    def get_token_usage(self):
        return self.token_usage.copy()
