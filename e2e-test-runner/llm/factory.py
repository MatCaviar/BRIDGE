# Copyright (c) 2025 Z-AXIS

"""
LLM Client Factory module.

This module provides a factory function for creating LLM clients based on
configuration. It supports multiple providers including OpenAI, Anthropic,
GLM (via OpenAI-compatible API), and Qwen (via OpenAI-compatible API).
"""

from typing import Optional, Union, Any

# Simple config wrapper instead of OmegaConf
class SimpleConfig:
    def __init__(self, config_dict: dict):
        self._data = config_dict

    def __getattr__(self, name: str) -> Any:
        if name in self._data:
            value = self._data[name]
            if isinstance(value, dict):
                return SimpleConfig(value)
            return value
        # Return None for missing attributes instead of raising error
        return None

    def merge(self, other: dict) -> 'SimpleConfig':
        merged = {**self._data, **other}
        return SimpleConfig(merged)

# Type alias for compatibility
DictConfig = SimpleConfig

from llm.providers.anthropic_client import AnthropicClient
from llm.providers.openai_client import OpenAIClient

# TaskLog type alias
TaskLog = Any

# Supported LLM providers
SUPPORTED_PROVIDERS = {"anthropic", "glm", "openai", "qwen"}


def ClientFactory(
    task_id: str, cfg: SimpleConfig, task_log: Optional[TaskLog] = None, **kwargs
) -> Union[OpenAIClient, AnthropicClient]:
    """
    Create an LLM client based on the provider specified in configuration.

    This factory function automatically selects and instantiates the appropriate
    client class based on the `llm.provider` field in the configuration.

    Args:
        task_id: Unique identifier for the current task (used for tracking)
        cfg: Configuration object containing LLM settings
        task_log: Optional logger for recording task execution details
        **kwargs: Additional keyword arguments to merge into configuration

    Returns:
        An instance of the appropriate LLM client (OpenAIClient or AnthropicClient)

    Example:
        >>> client = ClientFactory(
        ...     task_id="task_001",
        ...     cfg=cfg,
        ...     task_log=task_log
        ... )
    """
    provider = cfg.llm.provider
    config = cfg.merge(kwargs) if kwargs else cfg

    client_creators = {
        "anthropic": lambda: AnthropicClient(
            task_id=task_id, task_log=task_log, cfg=config
        ),
        "glm": lambda: OpenAIClient(task_id=task_id, task_log=task_log, cfg=config),
        "qwen": lambda: OpenAIClient(task_id=task_id, task_log=task_log, cfg=config),
        "openai": lambda: OpenAIClient(task_id=task_id, task_log=task_log, cfg=config),
    }

    factory = client_creators.get(provider)
    if not factory:
        raise ValueError(
            f"Unsupported provider: '{provider}'. "
            f"Supported providers are: {', '.join(sorted(SUPPORTED_PROVIDERS))}"
        )

    return factory()
