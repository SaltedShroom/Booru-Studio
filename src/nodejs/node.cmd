@echo off
REM Project-local Node wrapper using Electron's bundled runtime.
setlocal
set "ROOT=%~dp0..\.."
set "ELECTRON_EXE=%ROOT%\node_modules\electron\dist\electron.exe"
if not exist "%ELECTRON_EXE%" (
  echo ERROR: Electron runtime not found at "%ELECTRON_EXE%"
  exit /b 1
)
"%ELECTRON_EXE%" %*
