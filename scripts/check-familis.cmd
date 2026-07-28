@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0check-familis.ps1" %*
exit /b %ERRORLEVEL%
