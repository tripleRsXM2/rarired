export function makeTheme(dark) {
  if (dark) return {
    bg:"#1C1C1C", bgCard:"#242424", bgTertiary:"#2E2E2E", surfaceSolid:"#242424",
    border:"#2A2A2A", borderStrong:"#383838",
    text:"#EDEDED", textSecondary:"#A0A0A0", textTertiary:"#666666",
    accent:"#4A90E2", accentText:"#FFFFFF", accentSubtle:"rgba(74,144,226,0.12)",
    green:"#3D9970", greenSubtle:"rgba(61,153,112,0.12)",
    red:"#E74C3C", redSubtle:"rgba(231,76,60,0.12)",
    orange:"#E67E22", orangeSubtle:"rgba(230,126,34,0.12)",
    gold:"#F39C12", goldSubtle:"rgba(243,156,18,0.12)",
    purple:"#8E44AD", purpleSubtle:"rgba(142,68,173,0.12)",
    inputBg:"#2E2E2E", modalBg:"#242424",
    navBg:"rgba(28,28,28,0.97)", tabBar:"rgba(28,28,28,0.97)",
    qualified:"rgba(61,153,112,0.07)"
  };
  return {
    bg:"#F5F6F6", bgCard:"#FFFFFF", bgTertiary:"#F0F2F2", surfaceSolid:"#FFFFFF",
    border:"#E6E8E8", borderStrong:"#D0D4D4",
    text:"#424242", textSecondary:"#6B6B6B", textTertiary:"#9E9E9E",
    accent:"#4A90E2", accentText:"#FFFFFF", accentSubtle:"rgba(74,144,226,0.08)",
    green:"#3D9970", greenSubtle:"rgba(61,153,112,0.08)",
    red:"#E74C3C", redSubtle:"rgba(231,76,60,0.08)",
    orange:"#E67E22", orangeSubtle:"rgba(230,126,34,0.08)",
    gold:"#F39C12", goldSubtle:"rgba(243,156,18,0.08)",
    purple:"#8E44AD", purpleSubtle:"rgba(142,68,173,0.08)",
    inputBg:"#F5F6F6", modalBg:"#FFFFFF",
    navBg:"rgba(245,246,246,0.97)", tabBar:"rgba(245,246,246,0.97)",
    qualified:"rgba(61,153,112,0.06)"
  };
}

export function inputStyle(t) {
  return {
    width:"100%", padding:"11px 14px",
    borderRadius:8, border:"1px solid "+t.border,
    background:t.inputBg, color:t.text, fontSize:14,
    transition:"border-color 0.15s"
  };
}
