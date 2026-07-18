!macro AURORAMD_REGISTER_MARKDOWN_CONTEXT_MENU EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuroraMD" "" "在 AuroraMD 中打开"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuroraMD" "Icon" "$INSTDIR\auroramd.exe"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuroraMD\command" "" '"$INSTDIR\auroramd.exe" "%1"'
!macroend

!macro AURORAMD_UNREGISTER_MARKDOWN_CONTEXT_MENU EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\.${EXT}\shell\AuroraMD"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro AURORAMD_REGISTER_MARKDOWN_CONTEXT_MENU "md"
  !insertmacro AURORAMD_REGISTER_MARKDOWN_CONTEXT_MENU "markdown"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro AURORAMD_UNREGISTER_MARKDOWN_CONTEXT_MENU "md"
  !insertmacro AURORAMD_UNREGISTER_MARKDOWN_CONTEXT_MENU "markdown"
!macroend
