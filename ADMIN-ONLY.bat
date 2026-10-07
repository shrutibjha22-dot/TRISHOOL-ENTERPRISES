@echo off
REM ============================================================
REM  TRISHOOL ENTERPRISES - open the staff dashboard
REM
REM  Double-click this. It starts the database and the site server
REM  if they are not already running, then opens admin.html.
REM
REM  The public website has no admin link at all, so this is the way
REM  in. Nothing here is different from what the site does anyway:
REM  the dashboard only ever reads and writes through /api/admin/*,
REM  which refuses every request without a valid session cookie, so
REM  hiding the link is a convenience rather than the security.
REM
REM  Sign in with the admin email and password from your .env file.
REM
REM  Leave this window open. Closing it stops the server, which also
REM  stops the public forms from saving until it is started again.
REM
REM  This file only calls START-WEBSITE.bat - all the real work,
REM  including starting the database, lives in that one place.
REM ============================================================

cd /d "%~dp0"

if not exist "START-WEBSITE.bat" (
  echo.
  echo   ERROR: START-WEBSITE.bat is missing from this folder.
  echo   Keep both files together in the trishool-website folder.
  echo.
  pause
  exit /b 1
)

call "START-WEBSITE.bat" admin
exit /b %errorlevel%