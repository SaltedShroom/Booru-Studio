' Booru Studio launcher — starts Electron silently (no console window).
' Double-click this file to launch the app.

Dim shell, scriptDir
Set shell = CreateObject("WScript.Shell")

scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
shell.CurrentDirectory = scriptDir

' Run the bat hidden (0 = no console window)
shell.Run "cmd /c """ & scriptDir & "\start.bat""", 0, False
