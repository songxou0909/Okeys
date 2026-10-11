Option Explicit
Dim shell, files, folder, command
Set shell = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
folder = files.GetParentFolderName(WScript.ScriptFullName)
command = "pythonw.exe """ & folder & "\serve.py"" --open"
On Error Resume Next
shell.Run command, 0, False
If Err.Number <> 0 Then
    Err.Clear
    shell.Run "pyw.exe -3 """ & folder & "\serve.py"" --open", 0, False
    If Err.Number <> 0 Then
        MsgBox "The optional desktop launcher needs Python 3. You can also open index.html directly in Chrome or Edge.", vbInformation, "OKeys"
    End If
End If
