@echo off
REM ============================================================
REM  TRISHOOL ENTERPRISES - start the database and the website
REM
REM  Double-click this file. It starts the database if it is not
REM  already running, then starts the Node.js server that serves
REM  both the website and the API, then opens the browser.
REM
REM  Passing "nobrowser" as the first argument starts everything the
REM  same way but does not open a browser window. That is what the
REM  automatic start at Windows logon uses, so signing in does not
REM  fling a tab open every time.
REM
REM  IMPORTANT when editing this file:
REM    1. Never put an unescaped ) inside an echo inside an IF block.
REM       It silently ends the block and corrupts the script.
REM    2. Never rely on a variable that was SET inside an IF block
REM       from elsewhere in that same block. Percent signs are
REM       expanded when the block is read, before the SET runs.
REM       Set variables at the top level instead, as below.
REM ============================================================

title Trishool Enterprises - Website and Backend
cd /d "%~dp0"

setlocal enabledelayedexpansion

REM  Top level on purpose - see note 2 above. %~1 cannot be tested inside
REM  an IF block later on, so it is resolved to a plain flag right here.
set "OPENBROWSER=1"
if /i "%~1"=="nobrowser" set "OPENBROWSER="

REM ------------------------------------------------------------
REM  Locate Node.js.  Top level on purpose - see note 2 above.
REM ------------------------------------------------------------
set "NODE_DIR="
if exist "C:\node\node-v24.21.0-win-x64\node.exe" set "NODE_DIR=C:\node\node-v24.21.0-win-x64"
if not defined NODE_DIR for /d %%d in ("C:\node\node*") do if exist "%%~fd\node.exe" set "NODE_DIR=%%~fd"
if not defined NODE_DIR if exist "C:\Program Files\nodejs\node.exe" set "NODE_DIR=C:\Program Files\nodejs"
if not defined NODE_DIR if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_DIR=%ProgramFiles%\nodejs"
if not defined NODE_DIR if exist "%APPDATA%\nvm\current\node.exe" set "NODE_DIR=%APPDATA%\nvm\current"

if defined NODE_DIR set "PATH=!NODE_DIR!;!PATH!"

REM ------------------------------------------------------------
REM  Locate mysqld.exe.  Also top level, same reason.
REM ------------------------------------------------------------
set "MYSQLD="
if defined MARIADB_DIR if exist "!MARIADB_DIR!\bin\mysqld.exe" set "MYSQLD=!MARIADB_DIR!\bin\mysqld.exe"
if not defined MYSQLD for /d %%d in ("C:\mariadb\mariadb-*") do if exist "%%d\bin\mysqld.exe" set "MYSQLD=%%d\bin\mysqld.exe"
if not defined MYSQLD if exist "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe" set "MYSQLD=C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqld.exe"
if not defined MYSQLD if exist "C:\Program Files\MySQL\MySQL Server 8.1\bin\mysqld.exe" set "MYSQLD=C:\Program Files\MySQL\MySQL Server 8.1\bin\mysqld.exe"
if not defined MYSQLD if exist "C:\xampp\mysql\bin\mysqld.exe" set "MYSQLD=C:\xampp\mysql\bin\mysqld.exe"

echo.
echo   TRISHOOL ENTERPRISES
echo   ======================
echo.

REM ------------------------------------------------------------
REM  1. Node.js
REM ------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 goto nonode
echo   Node.js found.
goto nodeok

:nonode
echo.
echo   ERROR: Node.js could not be found.
echo.
echo   Install it from https://nodejs.org - choose the LTS version,
echo   then run this file again.
echo.
echo   If Node is installed in an unusual folder, set NODE_DIR at the
echo   top of this file to that folder.
echo.
pause
exit /b 1

:nodeok
echo.

REM ------------------------------------------------------------
REM  2. Database
REM ------------------------------------------------------------
netstat -ano | findstr ":3306 " | findstr "LISTENING" >nul
if not errorlevel 1 goto dbrunning

if not defined MYSQLD goto nomysql
echo   Database is not running. Starting it...
if exist "C:\mariadb\data" (
  start "" /min "!MYSQLD!" --datadir=C:\mariadb\data --port=3306 --bind-address=127.0.0.1
) else (
  start "" /min "!MYSQLD!"
)
goto dbwait

:nomysql
echo.
echo   ERROR: your database program was not found.
echo   Looked for mysqld.exe in C:\mariadb, Program Files\MySQL and xampp.
echo   Set MYSQLD at the top of this file to the full path of mysqld.exe,
echo   or start MySQL or MariaDB yourself and run this file again.
echo.
pause
exit /b 1

:dbwait
echo   Waiting for the database to start...
set /a tries=0
:dbloop
set /a tries+=1
netstat -ano | findstr ":3306 " | findstr "LISTENING" >nul
if not errorlevel 1 goto dbready
if !tries! gtr 40 goto dbtimeout
ping -n 2 127.0.0.1 >nul
goto dbloop

:dbtimeout
echo.
echo   ERROR: the database did not start within about a minute.
echo   Start MySQL or MariaDB yourself, then run this file again.
echo.
pause
exit /b 1

:dbready
echo   Database is ready.
goto done

:dbrunning
echo   Database is already running.

:done
echo.

REM ------------------------------------------------------------
REM  3. Configuration file
REM ------------------------------------------------------------
if exist ".env" goto envok
if not exist ".env.example" goto envok
copy /y ".env.example" ".env" >nul
echo   Created .env from .env.example
echo.
echo   FILL IN THESE THREE LINES IN THE FILE THAT OPENS NOW:
echo.
echo     DB_PASSWORD=your MySQL password
echo     ADMIN_SEED_EMAIL=your own email address
echo     ADMIN_SEED_PASSWORD=a password of your choice
echo.
notepad ".env"
echo   Saved. Continuing...
echo.

:envok

REM ------------------------------------------------------------
REM  4b. Is the website already running?
REM  This file is safe to run more than once, which matters now that
REM  Windows starts it automatically at logon. Without this check a
REM  second run dies on "port already in use", which reads as a
REM  failure even though the site is perfectly fine.
REM ------------------------------------------------------------
netstat -ano | findstr ":3000 " | findstr "LISTENING" >nul
if not errorlevel 1 goto alreadyserving

goto notserving

:alreadyserving
echo.
echo   The website is already running.
echo.
if defined OPENBROWSER start "" http://127.0.0.1:3000/
if defined OPENBROWSER echo   Opened it in your browser.
echo   To stop it, close the other command window.
echo.
REM  ping, not timeout: timeout fails with "Input redirection is not
REM  supported" whenever this runs without a console, which is exactly
REM  when a task or a scheduled job starts it for us.
ping -n 7 127.0.0.1 >nul
exit /b 0

:notserving

REM ------------------------------------------------------------
REM  4. Packages and tables, on a fresh copy only
REM ------------------------------------------------------------
if exist "node_modules" goto pkgok
echo   First run detected. Installing packages, please wait...
call npm install
if errorlevel 1 goto pkginstallfail
echo.
echo   Creating the database tables...
call npm run db:setup
echo   Loading the services and the admin account...
call npm run db:seed
echo.

:pkgok

REM ------------------------------------------------------------
REM  5. Start the website
REM ------------------------------------------------------------
echo   Starting the website...
echo.
if defined OPENBROWSER start "" http://127.0.0.1:3000/

REM   Keeps running until this window is closed.
node server\index.js

echo.
echo   Server stopped.
pause
exit /b 0

:pkginstallfail
echo.
echo   ERROR: npm install failed. Check your internet connection.
pause
exit /b 1