Set WshShell = CreateObject("WScript.Shell")
strPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run """" & strPath & "\node_modules\electron\dist\electron.exe"" """ & strPath & "\electron\main.cjs""", 1, False
