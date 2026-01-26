; FORGE LAB NSIS Installer Script
; Custom installation steps for Windows

!macro customHeader
  ; Custom branding
  !define MUI_HEADERIMAGE_BITMAP "installer-header.bmp"
  !define MUI_WELCOMEFINISHPAGE_BITMAP "installer-sidebar.bmp"
!macroend

!macro preInit
  ; Check for admin rights if needed
  ; UserInfo::GetAccountType
!macroend

!macro customInit
  ; Initialize custom variables
  Var /GLOBAL PythonInstalled
  Var /GLOBAL FFmpegInstalled
  
  ; Check for Python
  nsExec::ExecToStack '"$INSTDIR\resources\python\python.exe" --version'
  Pop $0
  ${If} $0 == 0
    StrCpy $PythonInstalled "1"
  ${Else}
    StrCpy $PythonInstalled "0"
  ${EndIf}
  
  ; Check for FFmpeg
  nsExec::ExecToStack '"$INSTDIR\resources\ffmpeg\ffmpeg.exe" -version'
  Pop $0
  ${If} $0 == 0
    StrCpy $FFmpegInstalled "1"
  ${Else}
    StrCpy $FFmpegInstalled "0"
  ${EndIf}
!macroend

!macro customInstall
  ; Create data directories
  CreateDirectory "$LOCALAPPDATA\FORGE LAB"
  CreateDirectory "$LOCALAPPDATA\FORGE LAB\library"
  CreateDirectory "$LOCALAPPDATA\FORGE LAB\logs"
  CreateDirectory "$LOCALAPPDATA\FORGE LAB\cache"
  
  ; Register application
  WriteRegStr HKCU "Software\FORGE LAB" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\FORGE LAB" "Version" "${VERSION}"
  
  ; Install Python packages (if embedded Python exists)
  ${If} ${FileExists} "$INSTDIR\resources\python\python.exe"
    DetailPrint "Installing Python dependencies..."
    
    ; Install pip if needed
    nsExec::ExecToLog '"$INSTDIR\resources\python\python.exe" -m ensurepip --upgrade'
    
    ; Install FORGE Engine dependencies
    ${If} ${FileExists} "$INSTDIR\resources\forge-engine\requirements.txt"
      nsExec::ExecToLog '"$INSTDIR\resources\python\python.exe" -m pip install -r "$INSTDIR\resources\forge-engine\requirements.txt" --quiet'
    ${EndIf}
  ${EndIf}
  
  ; Add FFmpeg to PATH for this user
  ${If} ${FileExists} "$INSTDIR\resources\ffmpeg\ffmpeg.exe"
    ; Read current PATH
    ReadRegStr $0 HKCU "Environment" "Path"
    
    ; Check if already in PATH
    ${StrContains} $1 "$INSTDIR\resources\ffmpeg" $0
    ${If} $1 == ""
      ; Append to PATH
      WriteRegExpandStr HKCU "Environment" "Path" "$0;$INSTDIR\resources\ffmpeg"
      
      ; Notify Windows of environment change
      SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
    ${EndIf}
  ${EndIf}
!macroend

!macro customUnInstall
  ; Remove data directories (optional - ask user)
  MessageBox MB_YESNO "Voulez-vous supprimer les données utilisateur (projets, cache) ?" IDNO skip_data
    RMDir /r "$LOCALAPPDATA\FORGE LAB"
  skip_data:
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\FORGE LAB"
  
  ; Remove from PATH
  ReadRegStr $0 HKCU "Environment" "Path"
  ${StrReplace} $1 ";$INSTDIR\resources\ffmpeg" "" $0
  WriteRegExpandStr HKCU "Environment" "Path" $1
  
  ; Notify Windows of environment change
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
!macroend

; Helper function to check if string contains substring
!macro StrContainsFunc
  !define StrContains "!insertmacro _StrContains"
  !macro _StrContains ResultVar SubStr String
    Push "${String}"
    Push "${SubStr}"
    Exch $R0
    Exch
    Exch $R1
    Push $R2
    Push $R3
    Push $R4
    Push $R5
    StrLen $R2 $R0
    StrLen $R3 $R1
    StrCpy $R4 0
    loop:
      StrCpy $R5 $R1 $R2 $R4
      StrCmp $R5 $R0 found
      StrCmp $R5 "" notfound
      IntOp $R4 $R4 + 1
      Goto loop
    found:
      StrCpy $R0 $R0
      Goto done
    notfound:
      StrCpy $R0 ""
    done:
    Pop $R5
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
    Exch $R0
    Pop "${ResultVar}"
  !macroend
!macroend
!insertmacro StrContainsFunc
