@echo off
title mini-crm dev
cd /d "%~dp0"
call npm run dev -- --port 9000 --strictPort
echo.
echo Dev-server exited. Press any key to close this window...
pause >nul
