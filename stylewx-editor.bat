@echo off
rem 一键启动 stylewx 本地 Web 编辑器（自动加载 .env，HTTP 模式）
rem 双击本文件，或在终端运行。
setlocal
title stylewx 本地编辑器
cd /d "%~dp0"
echo [stylewx] 启动本地 Web 编辑器...
node apps\mcp-server\scripts\editor.mjs
echo.
echo 服务已退出。若要重新打开，再双击本文件或运行 node apps\mcp-server\scripts\editor.mjs
pause
