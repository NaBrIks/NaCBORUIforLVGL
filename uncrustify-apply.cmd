@echo off
rem SPDX-License-Identifier: MIT
rem Copyright (c) 2026 Oleg Kozhevnikov
setlocal EnableExtensions DisableDelayedExpansion
if not "%2"=="" goto badArguments
if /i "%~1"=="--help" goto help
set "formatMode=Apply"
if /i "%~1"=="--check" (
    set "formatMode=Check"
) else if not "%1"=="" goto badArguments
where powershell.exe >nul 2>&1
if errorlevel 1 exit /b 2
powershell.exe -NoProfile -File "%~dp0tools\format_cpp.ps1" -Mode %formatMode%
exit /b %errorlevel%

:badArguments
echo ERROR: Unknown or extra argument. Use --help.
exit /b 2

:help
echo Usage: uncrustify-apply.cmd [--check ^| --help]
echo Default: format maintained tracked C/C++ files in place.
echo --check: report differences without changing files.
echo Scope and exclusions are defined by tools\format_cpp.ps1.
echo Requires Uncrustify 0.83.0_f through PATH or UNCRUSTIFY.
echo Exit codes: 0 = success, 1 = differences or file errors, 2 = setup or argument error.
exit /b 0
