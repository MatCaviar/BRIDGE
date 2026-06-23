#!/usr/bin/env python3
"""
Configuration loader for E2E Test Runner
Loads YAML config and provides environment variable substitution
"""

import os
import re
from pathlib import Path
from typing import Any, Dict

try:
    import yaml
except ImportError:
    raise ImportError(
        "PyYAML is required. Install with: pip install pyyaml"
    )


class SimpleConfig:
    """Simple config wrapper compatible with Z-AXIS LLM client"""

    def __init__(self, config_dict: Dict[str, Any]):
        self._data = config_dict

    def __getattr__(self, name: str) -> Any:
        if name in self._data:
            value = self._data[name]
            if isinstance(value, dict):
                return SimpleConfig(value)
            return value
        return None

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)


def resolve_env_vars(value: Any) -> Any:
    """
    Resolve environment variables in configuration values.

    Supports: ${VAR_NAME:default_value} syntax
    """
    if isinstance(value, str):
        # Match ${VAR:default} pattern
        pattern = r'\$\{([^:}]+):?([^}]*)\}'

        def replace_env(match):
            var_name = match.group(1)
            default_value = match.group(2)
            return os.environ.get(var_name, default_value)

        return re.sub(pattern, replace_env, value)

    elif isinstance(value, dict):
        return {k: resolve_env_vars(v) for k, v in value.items()}

    elif isinstance(value, list):
        return [resolve_env_vars(item) for item in value]

    return value


def load_config(config_path: str | Path = None) -> Dict[str, Any]:
    """
    Load configuration from YAML file.

    Handles model_profiles structure by merging the selected profile
    into llm and agent keys for compatibility.

    Args:
        config_path: Path to config.yaml. Defaults to config.yaml in script directory.

    Returns:
        Configuration dictionary with environment variables resolved and
        model profile merged into llm/agent keys.
    """
    if config_path is None:
        # Default to config.yaml in the same directory as this script
        config_path = Path(__file__).parent / "config.yaml"

    config_path = Path(config_path)

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    with open(config_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)

    # Resolve environment variables
    config = resolve_env_vars(config)

    # Handle model_profiles structure
    if "model_profiles" in config:
        model_profile_name = config.get("model_profile", "qwen3.6-flash")
        profiles = config.get("model_profiles", {})

        if model_profile_name not in profiles:
            available = ", ".join(profiles.keys())
            raise ValueError(
                f"Unknown model profile: '{model_profile_name}'. "
                f"Available: {available}"
            )

        # Merge selected profile into llm and agent keys
        config["llm"] = profiles[model_profile_name]
        if "agent" not in config:
            config["agent"] = {"keep_tool_result": -1}

    # Normalize server paths relative to config.yaml directory (NOT cwd).
    # Makes the runner work regardless of launch cwd: run-e2e.bat cd's to
    # e2e-test-runner, while direct invocation may run from im-mcp-codeagent.
    # config.yaml lives in e2e-test-runner/, so "../mcp-xxx" resolves to
    # im-mcp-codeagent/mcp-xxx consistently in both cases.
    config_dir = config_path.parent
    for server in config.get("servers", []):
        if server.get("path"):
            server["path"] = str((config_dir / server["path"]).resolve())
        if server.get("analysis_json"):
            server["analysis_json"] = str((config_dir / server["analysis_json"]).resolve())

    return config


def get_test_settings(config: Dict[str, Any] = None) -> Dict[str, Any]:
    """Get test settings from full config."""
    if config is None:
        config = load_config()

    return {
        "max_retries": config.get("max_retries", 3),
        "log_level": config.get("log_level", "INFO"),
    }
