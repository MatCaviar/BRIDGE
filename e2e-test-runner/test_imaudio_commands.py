#!/usr/bin/env python3
"""Test imaudio MCP server with real voice commands via LLM"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.resolve()))

from interactive import E2ETestRunner


# Test voice commands for imaudio
TEST_COMMANDS = [
    "帮我检查一下音频系统的健康状态",
    "查看当前音响效果模式",
    "切换到驾驶席模式",
    "查看均衡器设置",
    "开启Beosonic音效",
    "查看锁车音效状态",
]


async def test_commands():
    """Test each command sequentially"""
    runner = E2ETestRunner()
    await runner.initialize()

    print("\n" + "=" * 70)
    print("IMAUDIO MCP SERVER - REAL VOICE COMMAND TESTS")
    print("=" * 70)

    for i, command in enumerate(TEST_COMMANDS, 1):
        print(f"\n{'=' * 70}")
        print(f"Test {i}/{len(TEST_COMMANDS)}: {command}")
        print('=' * 70)

        try:
            response = await runner.process_user_input(command)
            print(f"\n✓ Command processed successfully")
            print(f"Response: {response[:200]}...")

        except Exception as e:
            print(f"\n✗ Command failed: {e}")

    print("\n" + "=" * 70)
    print("ALL TESTS COMPLETED")
    print("=" * 70)

    await runner.shutdown()


if __name__ == "__main__":
    asyncio.run(test_commands())
