@echo off
chcp 65001 >nul
rem =====================================================================
rem  stylewx local web editor launcher (Windows)
rem    - loads .env from the repo root
rem    - starts the MCP server in HTTP mode on port 3777
rem    - serves the editor at http://localhost:3777/editor
rem    - the same process also exposes http://localhost:3777/mcp
rem
rem  Double-click this file, or run it from a terminal.
rem
rem  NOTE: keep CRLF line endings and keep this file ASCII-only.
rem  cmd.exe decodes a batch file using the console's OEM codepage (936 on
rem  zh-CN, which is exactly what Explorer's double-click gives you). Raw
rem  UTF-8 Chinese bytes then mis-decode, and a multi-byte character can
rem  swallow the following line terminator, merging two lines into one
rem  broken command. So: no non-ASCII here. node prints the Chinese text.
rem  See .gitattributes.
rem =====================================================================
setlocal
cd /d "%~dp0"
title stylewx local editor
rem articles live in <repo>\articles; keep them out of the repo root.
rem This only sets a default -- an externally defined STYLEWX_ARTICLES_DIR wins.
if not defined STYLEWX_ARTICLES_DIR set "STYLEWX_ARTICLES_DIR=%~dp0articles"

echo.
echo [stylewx] starting local web editor ...
echo [stylewx] editor : http://localhost:3777/editor
echo [stylewx] mcp    : http://localhost:3777/mcp
echo [stylewx] press Ctrl+C to stop.
echo.

node "%~dp0apps\mcp-server\scripts\editor.mjs"

echo.
echo [stylewx] server exited (code %ERRORLEVEL%).
echo [stylewx] double-click this file again to restart.
pause
