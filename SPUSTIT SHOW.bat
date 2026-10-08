@echo off
cd /d "%~dp0"
title Co na to CHC
if not exist node_modules call npm install
call npm run build
start "" cmd /c "timeout /t 4 >nul & start http://localhost:3000"
npm start
pause
