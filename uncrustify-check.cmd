@echo off
rem SPDX-License-Identifier: MIT
rem Copyright (c) 2026 Oleg Kozhevnikov
setlocal EnableExtensions DisableDelayedExpansion
if not "%2"=="" goto badArguments
if /i "%~1"=="--help" goto help
if not "%1"=="" goto badArguments
where powershell.exe >nul 2>&1
if errorlevel 1 exit /b 2
powershell.exe -NoProfile -File "%~dp0tools\format_cpp.ps1" -Mode Check
exit /b %errorlevel%

:badArguments
echo ERROR: Unknown or extra argument. Use --help.
exit /b 2

:help
echo Usage: uncrustify-check.cmd [--help]
echo Check tracked C/C++ files without changing them.
echo Exit codes: 0 = clean, 1 = differences or file errors, 2 = setup or argument error.
exit /b 0
