; FORGE LAB NSIS Installer Script
; v1.0.0 - ALL-IN-ONE (Python + FFmpeg bundled)

!macro customInit
  ; Nothing needed - everything is bundled!
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
  
  ; Show success message
  MessageBox MB_OK|MB_ICONINFORMATION "FORGE LAB a ete installe avec succes !$\n$\nPython et FFmpeg sont inclus - aucune configuration supplementaire requise.$\n$\nLancez FORGE LAB depuis le Menu Demarrer ou le Bureau."
!macroend

!macro customUnInstall
  ; Ask before removing user data
  MessageBox MB_YESNO "Voulez-vous supprimer les donnees utilisateur (projets, cache) ?" IDNO skip_data
    RMDir /r "$LOCALAPPDATA\FORGE LAB"
  skip_data:
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\FORGE LAB"
!macroend
