var THEMES = {
  wimbledon: {
    bg:"#F4F4F0", bgCard:"#FFFFFF", bgTertiary:"#EBEBE6", surfaceSolid:"#FFFFFF",
    border:"#E0E0DA", borderStrong:"#CACAC4",
    text:"#1A1A1A", textSecondary:"#5C5C5C", textTertiary:"#A0A0A0",
    accent:"#3D5A1E", accentText:"#FFFFFF", accentSubtle:"rgba(61,90,30,0.08)",
    green:"#16A34A", greenSubtle:"rgba(22,163,74,0.07)",
    red:"#DC2626", redSubtle:"rgba(220,38,38,0.07)",
    orange:"#EA580C", orangeSubtle:"rgba(234,88,12,0.07)",
    gold:"#CA8A04", goldSubtle:"rgba(202,138,4,0.07)",
    purple:"#6B21A8", purpleSubtle:"rgba(107,33,168,0.07)",
    inputBg:"#F4F4F0", modalBg:"#FFFFFF",
    navBg:"rgba(244,244,240,0.92)", tabBar:"rgba(244,244,240,0.95)",
    qualified:"rgba(22,163,74,0.05)",
    r:6, r2:10,
  },
  ao: {
    bg:"#0A0E1A", bgCard:"#111827", bgTertiary:"#1A2236", surfaceSolid:"#111827",
    border:"#1E2D4A", borderStrong:"#2C3E5E",
    text:"#EEF2FF", textSecondary:"#94A3B8", textTertiary:"#4B6080",
    accent:"#3B82F6", accentText:"#FFFFFF", accentSubtle:"rgba(59,130,246,0.12)",
    green:"#22C55E", greenSubtle:"rgba(34,197,94,0.12)",
    red:"#F87171", redSubtle:"rgba(248,113,113,0.12)",
    orange:"#FB923C", orangeSubtle:"rgba(251,146,60,0.12)",
    gold:"#FBBF24", goldSubtle:"rgba(251,191,36,0.12)",
    purple:"#A78BFA", purpleSubtle:"rgba(167,139,250,0.12)",
    inputBg:"#1A2236", modalBg:"#111827",
    navBg:"rgba(10,14,26,0.92)", tabBar:"rgba(10,14,26,0.95)",
    qualified:"rgba(34,197,94,0.07)",
    r:6, r2:10,
  },
  "french-open": {
    bg:"#FDF6EE", bgCard:"#FFFFFF", bgTertiary:"#F5EAE0", surfaceSolid:"#FFFFFF",
    border:"#E8D5C4", borderStrong:"#D4B99E",
    text:"#2C1A0A", textSecondary:"#7A5540", textTertiary:"#B8956E",
    accent:"#C4431A", accentText:"#FFFFFF", accentSubtle:"rgba(196,67,26,0.08)",
    green:"#2D6A4F", greenSubtle:"rgba(45,106,79,0.07)",
    red:"#C4431A", redSubtle:"rgba(196,67,26,0.07)",
    orange:"#E07B39", orangeSubtle:"rgba(224,123,57,0.07)",
    gold:"#C48A00", goldSubtle:"rgba(196,138,0,0.07)",
    purple:"#7C3AED", purpleSubtle:"rgba(124,58,237,0.07)",
    inputBg:"#FDF6EE", modalBg:"#FFFFFF",
    navBg:"rgba(253,246,238,0.92)", tabBar:"rgba(253,246,238,0.95)",
    qualified:"rgba(45,106,79,0.05)",
    r:6, r2:10,
  },
  "us-open": {
    bg:"#080A0F", bgCard:"#0F1219", bgTertiary:"#171B25", surfaceSolid:"#0F1219",
    border:"#1C2233", borderStrong:"#2A3350",
    text:"#F0F4FF", textSecondary:"#8899BB", textTertiary:"#445577",
    accent:"#F0B429", accentText:"#000000", accentSubtle:"rgba(240,180,41,0.12)",
    green:"#34D399", greenSubtle:"rgba(52,211,153,0.12)",
    red:"#F87171", redSubtle:"rgba(248,113,113,0.12)",
    orange:"#FB923C", orangeSubtle:"rgba(251,146,60,0.12)",
    gold:"#F0B429", goldSubtle:"rgba(240,180,41,0.12)",
    purple:"#A78BFA", purpleSubtle:"rgba(167,139,250,0.12)",
    inputBg:"#171B25", modalBg:"#0F1219",
    navBg:"rgba(8,10,15,0.92)", tabBar:"rgba(8,10,15,0.95)",
    qualified:"rgba(52,211,153,0.07)",
    r:6, r2:10,
  },
};

export function makeTheme(themeName) {
  return THEMES[themeName] || THEMES.wimbledon;
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
