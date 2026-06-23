@echo off
echo ========================================
echo Claude Code 恢复脚本
echo ========================================
echo.
echo 此脚本将帮助您恢复之前删除的插件和技能
echo.
pause
echo.
echo [1/3] 检查 Claude Code CLI...
claude --version >/dev/null 2>&1
if errorlevel 1 (
    echo 错误: Claude Code CLI 未安装
    echo 请先安装: npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)
echo Claude Code CLI 已安装
echo.
echo [2/3] 可用的恢复命令:
echo.
echo 1. 查看可用插件:
echo    claude plugins list
echo.
echo 2. 安装已启用的插件:
echo    claude plugins install code-review@claude-plugins-official
echo    claude plugins install frontend-design@claude-plugins-official
echo    claude plugins install everything-claude-code@everything-claude-code
echo    claude plugins install pyright-lsp@claude-plugins-official
echo    claude plugins install context7@claude-plugins-official
echo    claude plugins install superpowers@superpowers-marketplace
echo.
echo 3. 查看可用技能:
echo    claude skills list
echo.
echo 4. 安装基础技能:
echo    claude skills install document-skills
echo.
echo [3/3] 是否自动执行插件安装?
set /p choice="输入 Y 自动安装，输入 N 手动安装: "
if /i "%choice%"=="Y" (
    echo.
    echo 正在安装插件...
    claude plugins install code-review@claude-plugins-official
    claude plugins install frontend-design@claude-plugins-official
    claude plugins install everything-claude-code@everything-claude-code
    claude plugins install pyright-lsp@claude-plugins-official
    claude plugins install context7@claude-plugins-official
    claude plugins install superpowers@superpowers-marketplace
    echo.
    echo 插件安装完成!
) else (
    echo.
    echo 请手动运行上述命令进行安装
)
echo.
pause
