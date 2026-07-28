@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-familis.ps1" %*
exit /b %ERRORLEVEL%
