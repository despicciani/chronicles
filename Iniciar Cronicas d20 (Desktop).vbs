Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
rootExe = strPath & "\Chronicles.exe"
releaseExe = strPath & "\release\Chronicles.exe"
electronExe = strPath & "\node_modules\electron\dist\electron.exe"
distIndex = strPath & "\dist\index.html"
If fso.FileExists(rootExe) Then
  WshShell.Run """" & rootExe & """", 1, False
ElseIf fso.FileExists(releaseExe) Then
  WshShell.Run """" & releaseExe & """", 1, False
ElseIf fso.FileExists(electronExe) And fso.FileExists(distIndex) Then
  WshShell.Run """" & electronExe & """ """ & strPath & "\electron\main.cjs""", 1, False
Else
  WshShell.Run "cmd.exe /c """"" & strPath & "\Iniciar Cronicas d20 (Desktop).bat""""", 1, False
End If
