Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
electronExe = strPath & "\node_modules\electron\dist\electron.exe"
distIndex = strPath & "\dist\index.html"
If fso.FileExists(electronExe) And fso.FileExists(distIndex) Then
  WshShell.Run """" & electronExe & """ """ & strPath & "\electron\main.cjs""", 1, False
Else
  WshShell.Run "cmd.exe /c """"" & strPath & "\Iniciar Cronicas d20 (Desktop).bat""""", 1, False
End If
