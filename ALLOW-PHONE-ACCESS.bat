@echo off
REM ============================================================
REM  TRISHOOL ENTERPRISES - let a phone or laptop reach the site
REM
REM  The website runs on this computer, but the Windows Firewall
REM  blocks other devices on your Wi-Fi from connecting to it.
REM  This adds one rule to allow port 3000 on PRIVATE networks.
REM
REM  HOW TO RUN
REM    1. Right-click this file
REM    2. Choose "Run as administrator"
REM    3. Press any key when it finishes
REM
REM  To undo it later: Windows Security > Firewall & firewall
REM  settings > Allow an app through firewall > uncheck Node.js.
REM ============================================================

title Trishool - Allow phone and laptop access

REM --- ask for Administrator rights if we do not have them ---
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo.
  echo   Requesting Administrator rights...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo.
echo   TRISHOOL ENTERPRISES - opening the firewall for port 3000
echo   ------------------------------------------------------
echo.

netsh advfirewall firewall delete rule name="Trishool Enterprises website" >nul 2>&1
netsh advfirewall firewall add rule name="Trishool Enterprises website" dir=in action=allow protocol=TCP localport=3000 profile=private remoteip=localsubnet

if %errorLevel% equ 0 (
  echo   SUCCESS. Port 3000 is now allowed on private networks.
) else (
  echo   ERROR: the rule could not be added. Try again as Administrator.
)

echo.
echo   Make sure the server is running:  npm start
echo.

for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\get-lan-ip.ps1"') do set LANIP=%%i

echo   Open the website on this computer:
echo     http://127.0.0.1:3000/
echo.
if defined LANIP (
  echo   Open it on your PHONE or another laptop:
echo     http://%LANIP%:3000/
  echo     http://%LANIP%:3000/admin.html
  echo.
  echo   The other device must be on the SAME Wi-Fi as this computer.
) else (
  echo   Could not detect your network address. Run "ipconfig" and
  echo   look for "IPv4 Address", then use http://THAT-NUMBER:3000/
)
echo.
pause
