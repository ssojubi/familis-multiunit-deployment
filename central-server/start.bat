@echo off
cd /d "%~dp0"
echo Starting central server...
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --ws-ping-interval 30 --ws-ping-timeout 30
pause
