export function makeTheme(dark) {
  if (dark) return {
    bg:"#080808", bgCard:"#111111", bgTertiary:"#1A1A1A", surfaceSolid:"#111111",
    border:"#242424", borderStrong:"#333333",
    text:"#EDEDED", textSecondary:"#A0A0A0", textTertiary:"#666666",
    accent:"#4A90E2", accentText:"#FFFFFF", accentSubtle:"rgba(74,144,226,0.12)",
    green:"#3D9970", greenSubtle:"rgba(61,153,112,0.12)",
    red:"#E74C3C", redSubtle:"rgba(231,76,60,0.12)",
    orange:"#E67E22", orangeSubtle:"rgba(230,126,34,0.12)",
    gold:"#F39C12", goldSubtle:"rgba(243,156,18,0.12)",
    purple:"#8E44AD", purpleSubtle:"rgba(142,68,173,0.12)",
    inputBg:"#1A1A1A", modalBg:"#111111",
    navBg:"rgba(8,8,8,0.92)", tabBar:"rgba(8,8,8,0.95)",
    qualified:"rgba(61,153,112,0.07)",
    r:6, r2:10
  };
  return {
    bg:"#F5F5F3", bgCard:"#FFFFFF", bgTertiary:"#EFEFED", surfaceSolid:"#FFFFFF",
    border:"#E2E2DF", borderStrong:"#CDCDC9",
    text:"#0A0A0A", textSecondary:"#6B6B6B", textTertiary:"#AAAAAA",
    accent:"#0A0A0A", accentText:"#FFFFFF", accentSubtle:"rgba(10,10,10,0.05)",
    green:"#16A34A", greenSubtle:"rgba(22,163,74,0.07)",
    red:"#DC2626", redSubtle:"rgba(220,38,38,0.07)",
    orange:"#EA580C", orangeSubtle:"rgba(234,88,12,0.07)",
    gold:"#CA8A04", goldSubtle:"rgba(202,138,4,0.07)",
    purple:"#7C3AED", purpleSubtle:"rgba(124,58,237,0.07)",
    inputBg:"#F5F5F3", modalBg:"#FFFFFF",
    navBg:"rgba(245,245,243,0.92)", tabBar:"rgba(245,245,243,0.95)",
    qualified:"rgba(22,163,74,0.05)",
    r:6, r2:10
  };
}

export function inputStyle(t) {
  return {
    width:"100%", padding:"12px 14px",
    borderRadius:t.r, border:"1px solid "+t.border,
    background:t.inputBg, color:t.text, fontSize:14,
    letterSpacing:"0.01em",
    transition:"border-color 0.2s"
  };
}
