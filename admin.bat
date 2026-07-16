@echo off
title Notes Admin Server - PDF Import Tool
cd /d "G:\OpenClaw-Workspace\notes-website"
echo Starting Notes Admin Server...
echo.
echo   Open: http://localhost:8765
echo   Stop: Ctrl+C
echo.
python admin_server.py --port 8765
pause
