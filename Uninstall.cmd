@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall.ps1" -RemoveCache
echo.
pause
