export function makeTheme(dark) {
  if (dark) return {
    bg:"#080808", bgCard:"#0F0F0F", bgTertiary:"#161616", surfaceSolid:"#0F0F0F",
    border:"#1C1C1C", borderStrong:"#2A2A2A",
    text:"#EFEFEF", textSecondary:"#666666", textTertiary:"#333333",
    accent:"#C8F535", accentText:"#080808", accentSubtle:"rgba(200,245,53,0.07)",
    green:"#4ADE80", greenSubtle:"rgba(74,222,128,0.07)",
    red:"#FF6B6B", redSubtle:"rgba(255,107,107,0.07)",
    orange:"#FB923C", orangeSubtle:"rgba(251,146,60,0.07)",
    gold:"#FBBF24", goldSubtle:"rgba(251,191,36,0.07)",
    purple:"#A78BFA", purpleSubtle:"rgba(167,139,250,0.07)",
    inputBg:"#111111", modalBg:"#0F0F0F",
    navBg:"rgba(8,8,8,0.92)", tabBar:"rgba(8,8,8,0.95)",
    qualified:"rgba(74,222,128,0.05)",
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
