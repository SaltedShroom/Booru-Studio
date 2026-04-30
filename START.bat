@echo off
title Booru Studio (Electron)
color 0B

echo ================================
echo  Booru Studio - Electron App
echo ================================
echo.

REM Check if Electron binary is present
if not exist "node_modules\electron\dist\electron.exe" (
    echo ERROR: Electron runtime not found.
    echo Please run "npm install" first or restore the app dependencies.
    echo.
    pause
    exit /b 1
)

REM Launch Electron directly and wait for it to close
echo Starting Booru Studio...
echo.
start /wait "" "node_modules\electron\dist\electron.exe" .

REM Electron has closed — exit the console window
exit
