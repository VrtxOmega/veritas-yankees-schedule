@echo off
REM ────────────────────────────────────────────────────────────────────
REM  VERITAS Yankees 2026 — desktop launcher
REM  Runs `npm start` from the project directory regardless of where
REM  the .lnk that invokes this lives.
REM ────────────────────────────────────────────────────────────────────
cd /d "%~dp0"
start "VERITAS Yankees 2026" /B cmd /c "npm start"
exit /b
