@echo off
title Booru Studio
color 0A

echo ================================
echo  Booru Studio
echo ================================
echo.

REM Run with the project's bundled Node wrapper.
set "APPDIR=%~dp0"
set "NODE_WRAPPER=%APPDIR%nodejs\node.cmd"
if not exist "%NODE_WRAPPER%" (
    echo ERROR: Local Node wrapper not found.
    echo Please ensure nodejs\node.cmd exists in the project.
    echo.
    pause
    exit /b 1
)

echo Using local project Node runtime...
pushd "%APPDIR%"
"%NODE_WRAPPER%" "%APPDIR%start.js"
popd

REM If the script exits, pause so user can see any errors
pause
