@echo off
title Dump Assistant Bot Launcher
chcp 65001 > nul

echo ===================================================
echo   Starting Dump Assistant Bot and ngrok Tunnel
echo ===================================================
echo.

echo [1/2] Starting bot server...
start "Dump Assistant Bot Backend" cmd /k "npm start"

echo [2/2] Starting ngrok tunnel...
:: Replace <YOUR_NGROK_DOMAIN> with your actual ngrok free domain (e.g. your-subdomain.ngrok-free.app)
start "ngrok Tunnel" cmd /k "ngrok http --url=<YOUR_NGROK_DOMAIN> 3001"

echo.
echo ===================================================
echo   Processes started. This window will close.
echo ===================================================
echo.
timeout /t 5
