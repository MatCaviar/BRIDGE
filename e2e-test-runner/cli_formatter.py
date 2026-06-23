#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Professional CLI formatting and styling for E2E Test Runner
Provides high information density, elegant colors, and professional appearance
"""

import asyncio
import json
import re
import sys
import time
from typing import Optional, List, Dict, Any
from enum import Enum

# Enable UTF-8 output on Windows
if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter("utf-8")(sys.stderr.buffer, 'strict')


class Color(Enum):
    """ANSI color codes for professional terminal styling"""
    # Primary colors - carefully selected for professional appearance
    RESET = "\033[0m"
    BOLD = "\033[1m"
    DIM = "\033[2m"

    # Foreground colors - high contrast, professional palette
    BLACK = "\033[30m"
    RED = "\033[31m"      # Errors, failures
    GREEN = "\033[32m"    # Success, active
    YELLOW = "\033[33m"   # Warnings, processing
    BLUE = "\033[34m"     # Info, primary
    MAGENTA = "\033[35m"  # Accent
    CYAN = "\033[36m"     # Secondary info
    WHITE = "\033[37m"    # Default text

    # Bright variants for emphasis
    BRIGHT_RED = "\033[91m"
    BRIGHT_GREEN = "\033[92m"
    BRIGHT_YELLOW = "\033[93m"
    BRIGHT_BLUE = "\033[94m"
    BRIGHT_MAGENTA = "\033[95m"
    BRIGHT_CYAN = "\033[96m"
    BRIGHT_WHITE = "\033[97m"

    # Background colors - subtle, professional
    BG_BLACK = "\033[40m"
    BG_RED = "\033[41m"
    BG_GREEN = "\033[42m"
    BG_YELLOW = "\033[43m"
    BG_BLUE = "\033[44m"
    BG_MAGENTA = "\033[45m"
    BG_CYAN = "\033[46m"
    BG_WHITE = "\033[47m"


class Style:
    """Predefined style combinations for consistent styling"""

    # Status indicators
    SUCCESS = f"{Color.GREEN.value}{Color.BOLD.value}"
    ERROR = f"{Color.RED.value}{Color.BOLD.value}"
    WARNING = f"{Color.YELLOW.value}{Color.BOLD.value}"
    INFO = f"{Color.CYAN.value}{Color.BOLD.value}"
    PRIMARY = f"{Color.BLUE.value}{Color.BOLD.value}"
    DIM = f"{Color.DIM.value}"

    # Component-specific styles
    HEADER = f"{Color.BRIGHT_BLUE.value}{Color.BOLD.value}"
    SUBHEADER = f"{Color.BLUE.value}{Color.BOLD.value}"
    ACCENT = f"{Color.BRIGHT_CYAN.value}"
    HIGHLIGHT = f"{Color.BRIGHT_YELLOW.value}"
    METADATA = f"{Color.DIM.value}"

    # Tool/MCP specific
    SERVER = f"{Color.MAGENTA.value}{Color.BOLD.value}"
    TOOL = f"{Color.BRIGHT_GREEN.value}"
    PARAM = f"{Color.CYAN.value}"
    VALUE = f"{Color.YELLOW.value}"

    # Performance metrics
    LATENCY_FAST = f"{Color.GREEN.value}"
    LATENCY_NORMAL = f"{Color.YELLOW.value}"
    LATENCY_SLOW = f"{Color.RED.value}"


class CLIFormatter:
    """Professional CLI formatter with high information density"""

    def __init__(self):
        self.unicode_enabled = True
        self.color_enabled = True

    def colorize(self, text: str, style: str) -> str:
        """Apply color/style to text"""
        if not self.color_enabled:
            return text
        return f"{style}{text}{Color.RESET.value}"

    def strip_ansi(self, text: str) -> str:
        """Remove ANSI codes for length calculation"""
        ansi_escape = re.compile(r'\033\[[0-9;]*m')
        return ansi_escape.sub('', text)

    def header(self, title: str, subtitle: str = "", width: int = 80) -> str:
        """Create a professional header"""
        lines = []

        # Top border
        lines.append(self.colorize("┌" + "─" * (width - 2) + "┐", Style.ACCENT))

        # Title line
        title_text = f" {title} "
        if subtitle:
            title_text += f"│ {subtitle} "

        padding = width - len(self.strip_ansi(title_text)) - 2
        lines.append(self.colorize("│" + title_text + " " * padding + "│", Style.HEADER))

        # Bottom border
        lines.append(self.colorize("└" + "─" * (width - 2) + "┘", Style.ACCENT))

        return "\n".join(lines)

    def section(self, title: str) -> str:
        """Create a section divider"""
        return f"\n{self.colorize('▸ ' + title, Style.SUBHEADER)}\n"

    def status_line(self, icon: str, message: str, style: str, width: int = 70) -> str:
        """Create a status line with fixed width"""
        message_padding = width - len(self.strip_ansi(message))
        return f"{icon} {self.colorize(message, style)}{' ' * max(1, message_padding)}"

    def progress_bar(self, current: int, total: int, width: int = 30,
                     prefix: str = "", suffix: str = "") -> str:
        """Create a progress bar"""
        if total == 0:
            percentage = 100
        else:
            percentage = int((current / total) * 100)

        filled = int(width * percentage / 100)
        bar = "█" * filled + "░" * (width - filled)

        return f"{prefix} {self.colorize(bar, Style.SUCCESS)} {percentage}% {suffix}"

    def key_value(self, key: str, value: Any, key_style: str = Style.METADATA,
                   value_style: str = "", width: int = 20) -> str:
        """Format key-value pair with alignment"""
        key_text = self.colorize(key.ljust(width), key_style)
        value_text = self.colorize(str(value), value_style) if value_style else str(value)
        return f"{key_text} {value_text}"

    def table(self, headers: List[str], rows: List[List[str]],
              align: List[str] = None) -> str:
        """Create a professional table"""
        if align is None:
            align = ["left"] * len(headers)

        # Calculate column widths
        col_widths = [len(h) for h in headers]
        for row in rows:
            for i, cell in enumerate(row):
                col_widths[i] = max(col_widths[i], len(self.strip_ansi(str(cell))))

        # Build header
        header_line = Style.PRIMARY + "│"
        for i, (h, w) in enumerate(zip(headers, col_widths)):
            padding = w - len(self.strip_ansi(h))
            if align[i] == "right":
                header_line += " " * padding + h + " │"
            else:
                header_line += h + " " * padding + " │"
        header_line += Color.RESET.value

        # Build separator
        separator = Style.ACCENT + "┼" + ("─" * (sum(col_widths) + len(col_widths) * 3 - 1)) + "┼" + Color.RESET.value

        # Build rows
        lines = [separator, header_line, separator]
        for row in rows:
            row_line = "│"
            for i, (cell, w) in enumerate(zip(row, col_widths)):
                padding = w - len(self.strip_ansi(str(cell)))
                if align[i] == "right":
                    row_line += " " * padding + str(cell) + " │"
                else:
                    row_line += str(cell) + " " * padding + " │"
            lines.append(row_line)
        lines.append(separator)

        return "\n".join(lines)

    def tool_call(self, server: str, tool: str, args: Dict[str, Any]) -> str:
        """Format tool call display with high information density"""
        lines = []

        # Server and tool
        lines.append(self.colorize(f"  ► {server}.{tool}", Style.TOOL))

        # Arguments (compact format)
        if args:
            args_str = ", ".join([f"{self.colorize(k, Style.PARAM)}={self.colorize(repr(v), Style.VALUE)}"
                                 for k, v in args.items()])
            lines.append(f"    {args_str}")

        return "\n".join(lines)

    def tool_result(self, server: str, tool: str, result: Dict[str, Any], max_len: int = 160) -> str:
        """Format tool execution result compactly: success/fail icon + extracted fields."""
        success = result.get("success", False)
        icon = "✓" if success else "✗"
        style = Style.SUCCESS if success else Style.ERROR
        header = f"  {self.colorize(icon, style)} {self.colorize(f'{server}.{tool}', Style.TOOL)}"

        if success:
            summary = self._summarize_result(result.get("result", {}), max_len)
            if summary:
                return f"{header} {self.colorize('→', Style.METADATA)} {summary}"
            return header
        else:
            err = self._truncate(str(result.get("error", "Unknown error")), max_len)
            return f"{header} {self.colorize('→', Style.METADATA)} {self.colorize(err, Style.ERROR)}"

    def _summarize_result(self, data: Any, max_len: int) -> str:
        """Extract human-readable summary from tool result (handles MCP content array)."""
        # MCP CallToolResult: {content: [{type:'text', text:'<json>'}]}
        text = None
        if isinstance(data, dict):
            content = data.get("content")
            if isinstance(content, list):
                texts = [c.get("text", "") for c in content
                         if isinstance(c, dict) and c.get("type") == "text"]
                text = "\n".join(t for t in texts if t)
        if text is None:
            text = str(data) if data else ""

        # Try parse JSON for structured key=value display
        try:
            parsed = json.loads(text)
        except (ValueError, TypeError):
            parsed = None
        if isinstance(parsed, dict) and parsed:
            # Unwrap framework envelope {success, data: {actual fields}}
            if isinstance(parsed.get("data"), dict):
                parsed = parsed["data"]
            parts = [f"{self.colorize(k, Style.PARAM)}={self.colorize(self._truncate(str(v), 30), Style.VALUE)}"
                     for k, v in parsed.items()]
            return ", ".join(parts)
        return self.colorize(self._truncate(text, max_len), Style.DIM)

    def _truncate(self, s: str, max_len: int) -> str:
        """Collapse whitespace and truncate to max_len with ellipsis."""
        s = " ".join(str(s).split())
        return s if len(s) <= max_len else s[:max_len - 3] + "..."

    def metric(self, label: str, value: str, unit: str = "", threshold: Dict[str, float] = None) -> str:
        """Format performance metric with color coding"""
        if threshold is None:
            threshold = {}

        try:
            num_value = float(value)
            if "good" in threshold and num_value <= threshold["good"]:
                style = Style.LATENCY_FAST
            elif "warn" in threshold and num_value <= threshold["warn"]:
                style = Style.LATENCY_NORMAL
            else:
                style = Style.LATENCY_SLOW
        except (ValueError, TypeError):
            style = ""

        value_text = f"{value}{unit}" if unit else value
        return f"{self.colorize(label, Style.METADATA)}: {self.colorize(value_text, style)}"

    def compact_status(self, checks: List[Dict[str, Any]]) -> str:
        """Create compact status row for multiple items"""
        items = []
        for check in checks:
            icon = "✓" if check.get("status") == "ok" else "✗"
            style = Style.SUCCESS if check.get("status") == "ok" else Style.ERROR
            name = check.get("name", "")
            items.append(f"{self.colorize(icon, style)} {self.colorize(name, Style.DIM)}")

        return "  ".join(items)

    def token_info(self, input_tokens: int, output_tokens: int,
                   cache_read: int = 0, cache_write: int = 0) -> str:
        """Format token usage information"""
        parts = []

        if cache_read > 0 or cache_write > 0:
            parts.append(f"{self.colorize('Cache', Style.METADATA)}: "
                       f"{self.colorize(str(cache_write), Style.HIGHLIGHT)}W+"
                       f"{self.colorize(str(cache_read), Style.HIGHLIGHT)}R")

        total = input_tokens + output_tokens + cache_read + cache_write
        parts.append(f"{self.colorize('Total', Style.METADATA)}: {self.colorize(str(total), Style.ACCENT)}")
        parts.append(f"{self.colorize(str(input_tokens), Style.DIM)}↓")
        parts.append(f"{self.colorize(str(output_tokens), Style.DIM)}↑")

        return " • ".join(parts)


class Spinner:
    """Professional loading spinner with multiple styles"""

    FRAMES = {
        "dots": ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
        "arrows": ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
        "progress": ["▤", "▐", "▀", "▌", "▄", "▌", "▀", "▐"],
        "minimal": ["∙∙∙", "●∙∙", "∙●∙", "∙∙●"],
        "thinking": ["◐", "◓", "◑", "◒"],
        "pulse": ["◌", "◎", "○", "◯"],
    }

    def __init__(self, style: str = "progress", message: str = "Processing"):
        self.style = style
        self.message = message
        self.frames = self.FRAMES[style]
        self.current_frame = 0
        self.running = False
        self.formatter = CLIFormatter()

    def __enter__(self):
        self.running = True
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.running = False
        # Clear the spinner line
        print("\r" + " " * 100 + "\r", end="", flush=True)

    def update(self, message: str = None):
        """Update spinner with new message"""
        if not self.running:
            return

        if message:
            self.message = message

        frame = self.frames[self.current_frame]
        print(f"\r{self.formatter.colorize(frame, Style.PRIMARY)} {self.message}",
              end="", flush=True)

        self.current_frame = (self.current_frame + 1) % len(self.frames)


class AsyncSpinner:
    """Async spinner that animates while waiting for operations"""

    FRAMES = {
        "thinking": ["◐", "◓", "◑", "◒"],
        "pulse": ["◌", "◎", "○", "◯"],
        "dots": ["⢿", "⣻", "⣽", "⣾", "⣷", "⣯", "⣟", "⡿"],
        "waves": ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
    }

    def __init__(self, message: str = "Thinking", style: str = "thinking"):
        self.message = message
        self.frames = self.FRAMES.get(style, self.FRAMES["thinking"])
        self.current_frame = 0
        self.running = False
        self.task = None
        self.formatter = CLIFormatter()

    async def __aenter__(self):
        self.running = True
        self.task = asyncio.create_task(self._animate())
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        self.running = False
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
        # Clear the spinner line
        print("\r" + " " * 100 + "\r", end="", flush=True)

    async def _animate(self):
        """Animation loop"""
        import asyncio
        while self.running:
            frame = self.frames[self.current_frame]
            # Build the line without ANSI codes for length calculation
            plain_text = f"{frame} {self.message}"
            # Get visible length
            visible_len = len(self.formatter.strip_ansi(plain_text))
            # Clear enough space for the line
            clear_len = visible_len + 10
            # Print with ANSI codes and clear space
            colored_line = f"\r{self.formatter.colorize(frame, Style.ACCENT)} {self.formatter.colorize(self.message, Style.METADATA)}"
            print(f"{colored_line}{' ' * clear_len}", end="", flush=True)
            # Move back to start for next frame
            print(f"\r", end="", flush=True)
            self.current_frame = (self.current_frame + 1) % len(self.frames)
            await asyncio.sleep(0.15)

    def update_message(self, message: str):
        """Update the spinner message"""
        self.message = message


class Timer:
    """High-precision timer for performance tracking"""

    def __init__(self):
        self.start_time = None
        self.end_time = None

    def __enter__(self):
        self.start_time = time.perf_counter()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.end_time = time.perf_counter()

    @property
    def elapsed_ms(self) -> float:
        """Get elapsed time in milliseconds"""
        if self.start_time is None:
            return 0.0
        end = self.end_time if self.end_time else time.perf_counter()
        return (end - self.start_time) * 1000

    @property
    def elapsed_s(self) -> float:
        """Get elapsed time in seconds"""
        return self.elapsed_ms / 1000


# Global formatter instance
formatter = CLIFormatter()
spinner = Spinner
timer = Timer