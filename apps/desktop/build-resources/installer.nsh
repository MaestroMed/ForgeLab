; FORGE LAB NSIS Installer Script
; Beta v1.0.0 - Requires Python and FFmpeg pre-installed

!macro customInit
  ; Nothing special needed for beta
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
  
  ; Check Python availability and show instructions if missing
  nsExec::ExecToStack 'python --version'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONINFORMATION "FORGE LAB requiert Python 3.11+.$\n$\nTelechargez-le sur: python.org/downloads$\n$\nCochez 'Add Python to PATH' lors de l'installation."
  ${EndIf}
  
  ; Check FFmpeg availability
  nsExec::ExecToStack 'ffmpeg -version'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_OK|MB_ICONINFORMATION "FORGE LAB requiert FFmpeg.$\n$\nTelechargez-le sur: ffmpeg.org/download.html$\n$\nAjoutez le dossier bin a votre PATH."
  ${EndIf}
!macroend

!macro customUnInstall
  ; Ask before removing user data
  MessageBox MB_YESNO "Voulez-vous supprimer les donnees utilisateur (projets, cache) ?" IDNO skip_data
    RMDir /r "$LOCALAPPDATA\FORGE LAB"
  skip_data:
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\FORGE LAB"
!macroend
