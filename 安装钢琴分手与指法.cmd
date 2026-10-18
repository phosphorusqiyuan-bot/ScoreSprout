@echo off
chcp 65001 >nul
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-piano.ps1"
if errorlevel 1 echo 安装没有完成，请查看上面的错误并重试。
pause
