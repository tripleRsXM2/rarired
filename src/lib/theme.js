// Theme tokens. Four palettes named after court surfaces (not tournaments)
// so we don't step on Wimbledon / Australian Open / Roland-Garros / USTA
// trademarks. Legacy ids (`wimbledon`, `ao`, `french-open`, `us-open`) are
// still accepted by `makeTheme` for users with old values in localStorage
// — the App-level loader migrates them to the new ids on the next save.

var THEMES = {
  // Editorial — cream paper + dark brown ink. THIS IS NOW THE ONLY
  // V1 LOOK. The legacy multi-theme picker has been removed (user
  // feedback: 'i like the css of the cream and dark brown grey thats
  // on the compete people and profile. Can we make that extend the
  // side tabs? Essentially I dont want there to be any appearance
  // changes in v1. I just want one appearance.'). Every legacy
  // theme id now aliases here via LEGACY_THEME_ALIASES so existing
  // localStorage entries silently migrate on next load.
  //
  // Token values mirror the Editorial Tennis ED_TOK palette used in
  // src/features/home/components/EditorialScreen.jsx so the legacy
  // chrome (sidebar, top bar, Settings, Map, DM list, etc.) reads as
  // one cohesive surface with the editorial screens.
  editorial: {
    bg:"#F0E9DA", bgCard:"#FAF4E6", bgTertiary:"#E8E0CE", surfaceSolid:"#FAF4E6",
    border:"rgba(42,32,26,0.12)", borderStrong:"rgba(42,32,26,0.22)",
    text:"#2A201A", textSecondary:"#4A3F36", textTertiary:"#8A7F70",
    accent:"#FF2D55", accentText:"#FFFFFF", accentSubtle:"rgba(255,45,85,0.08)",
    green:"#3A7D44", greenSubtle:"rgba(58,125,68,0.10)",
    red:"#C3392B", redSubtle:"rgba(195,57,43,0.08)",
    orange:"#D18032", orangeSubtle:"rgba(209,128,50,0.08)",
    gold:"#B98533", goldSubtle:"rgba(185,133,51,0.10)",
    purple:"#5C3A6E", purpleSubtle:"rgba(92,58,110,0.08)",
    inputBg:"#FAF4E6", modalBg:"#FAF4E6",
    navBg:"rgba(240,233,218,0.92)", tabBar:"rgba(240,233,218,0.95)",
    qualified:"rgba(255,45,85,0.06)",
    r:6, r2:10,
  },
  // Grass — clean court green + cream. Default.
  grass: {
    bg:"#F0F2EA", bgCard:"#FFFFFF", bgTertiary:"#E4EAD6", surfaceSolid:"#FFFFFF",
    border:"#D3DCC0", borderStrong:"#B5C29A",
    text:"#1A2A1E", textSecondary:"#4C5C50", textTertiary:"#8A9C8E",
    accent:"#006F4A", accentText:"#FFFFFF", accentSubtle:"rgba(0,111,74,0.10)",
    green:"#3E8E3E", greenSubtle:"rgba(62,142,62,0.10)",
    red:"#B33A3A", redSubtle:"rgba(179,58,58,0.08)",
    orange:"#D18032", orangeSubtle:"rgba(209,128,50,0.08)",
    gold:"#A8BC45", goldSubtle:"rgba(168,188,69,0.12)",
    purple:"#5C3A6E", purpleSubtle:"rgba(92,58,110,0.08)",
    inputBg:"#F0F2EA", modalBg:"#FFFFFF",
    navBg:"rgba(240,242,234,0.92)", tabBar:"rgba(240,242,234,0.95)",
    qualified:"rgba(0,111,74,0.06)",
    r:6, r2:10,
  },
  // Hard Court — dark navy hard-court blue.
  "hard-court": {
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
  // Clay — terracotta + warm cream.
  clay: {
    bg:"#EEE0CA", bgCard:"#F7ECD9", bgTertiary:"#E5D4B9", surfaceSolid:"#F7ECD9",
    border:"#D4C4A4", borderStrong:"#B8A580",
    text:"#2C1810", textSecondary:"#6B4A32", textTertiary:"#A88870",
    accent:"#E0783B", accentText:"#FFFFFF", accentSubtle:"rgba(224,120,59,0.10)",
    green:"#556B3A", greenSubtle:"rgba(85,107,58,0.08)",
    red:"#8B3118", redSubtle:"rgba(139,49,24,0.08)",
    orange:"#E0783B", orangeSubtle:"rgba(224,120,59,0.08)",
    gold:"#B98533", goldSubtle:"rgba(185,133,51,0.10)",
    purple:"#6B2E4F", purpleSubtle:"rgba(107,46,79,0.08)",
    inputBg:"#F5EAD4", modalBg:"#F7ECD9",
    navBg:"rgba(238,224,202,0.92)", tabBar:"rgba(238,224,202,0.95)",
    qualified:"rgba(85,107,58,0.06)",
    r:6, r2:10,
  },
  // Night Court — deep navy + gold under the lights.
  "night-court": {
    bg:"#001C4E", bgCard:"#002566", bgTertiary:"#002D7A", surfaceSolid:"#002566",
    border:"#0040A0", borderStrong:"#0055CC",
    text:"#F0F6FF", textSecondary:"#8BB4E8", textTertiary:"#4A7AB5",
    accent:"#FFC72C", accentText:"#00235B", accentSubtle:"rgba(255,199,44,0.12)",
    green:"#34D399", greenSubtle:"rgba(52,211,153,0.12)",
    red:"#F87171", redSubtle:"rgba(248,113,113,0.12)",
    orange:"#FB923C", orangeSubtle:"rgba(251,146,60,0.12)",
    gold:"#FFC72C", goldSubtle:"rgba(255,199,44,0.12)",
    purple:"#A78BFA", purpleSubtle:"rgba(167,139,250,0.12)",
    inputBg:"#002D7A", modalBg:"#002566",
    navBg:"rgba(0,28,78,0.92)", tabBar:"rgba(0,28,78,0.95)",
    qualified:"rgba(52,211,153,0.07)",
    r:6, r2:10,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Masters 1000 themes — inspired by the signature palettes of each major
  // spring-to-autumn event. Named generically (geographic / descriptive) so
  // we don't touch the real brand marks.
  // ─────────────────────────────────────────────────────────────────────────

  // ("Desert Open" + "Oceanside" themes retired per user.)

  // "Riviera" — Monte Carlo: royal red on ivory.
  riviera: {
    bg:"#F7F0E4", bgCard:"#FFFFFF", bgTertiary:"#EAE2D2", surfaceSolid:"#FFFFFF",
    border:"#D6CDB7", borderStrong:"#B6AD94",
    text:"#1E1412", textSecondary:"#5A4B46", textTertiary:"#9A8A83",
    accent:"#B81F2E", accentText:"#FFFFFF", accentSubtle:"rgba(184,31,46,0.10)",
    green:"#3E7A3E", greenSubtle:"rgba(62,122,62,0.10)",
    red:"#B81F2E", redSubtle:"rgba(184,31,46,0.08)",
    orange:"#D88040", orangeSubtle:"rgba(216,128,64,0.10)",
    gold:"#C49A3A", goldSubtle:"rgba(196,154,58,0.12)",
    purple:"#5E2E6E", purpleSubtle:"rgba(94,46,110,0.08)",
    inputBg:"#F7F0E4", modalBg:"#FFFFFF",
    navBg:"rgba(247,240,228,0.92)", tabBar:"rgba(247,240,228,0.95)",
    qualified:"rgba(184,31,46,0.06)",
    r:6, r2:10,
  },

  // ("Plaza Roja" + "Foro" themes retired per user.)

  // "Maple" — Canada: maple-leaf red on crisp white.
  maple: {
    bg:"#FAF7F5", bgCard:"#FFFFFF", bgTertiary:"#F0E8E6", surfaceSolid:"#FFFFFF",
    border:"#E2CFCC", borderStrong:"#C9ACA8",
    text:"#1E0F0D", textSecondary:"#5A3F3B", textTertiary:"#97807B",
    accent:"#D60A1F", accentText:"#FFFFFF", accentSubtle:"rgba(214,10,31,0.10)",
    green:"#338A4E", greenSubtle:"rgba(51,138,78,0.10)",
    red:"#D60A1F", redSubtle:"rgba(214,10,31,0.08)",
    orange:"#E58420", orangeSubtle:"rgba(229,132,32,0.10)",
    gold:"#C7932A", goldSubtle:"rgba(199,147,42,0.12)",
    purple:"#6B2E6E", purpleSubtle:"rgba(107,46,110,0.08)",
    inputBg:"#FAF7F5", modalBg:"#FFFFFF",
    navBg:"rgba(250,247,245,0.92)", tabBar:"rgba(250,247,245,0.95)",
    qualified:"rgba(214,10,31,0.05)",
    r:6, r2:10,
  },

  // ("Queen City" + "Bund" themes retired per user.)

  // "Paris Indoor" — Paris Masters: cool silver on slate.
  "paris-indoor": {
    bg:"#0F1520", bgCard:"#161E2D", bgTertiary:"#1D2636", surfaceSolid:"#161E2D",
    border:"#2B3648", borderStrong:"#3D4B5F",
    text:"#EAF0F6", textSecondary:"#9CABB8", textTertiary:"#5D6C7B",
    accent:"#C9D1D9", accentText:"#0F1520", accentSubtle:"rgba(201,209,217,0.12)",
    green:"#4ADE80", greenSubtle:"rgba(74,222,128,0.12)",
    red:"#F87171", redSubtle:"rgba(248,113,113,0.12)",
    orange:"#FB923C", orangeSubtle:"rgba(251,146,60,0.12)",
    gold:"#FACC15", goldSubtle:"rgba(250,204,21,0.12)",
    purple:"#A78BFA", purpleSubtle:"rgba(167,139,250,0.12)",
    inputBg:"#1D2636", modalBg:"#161E2D",
    navBg:"rgba(15,21,32,0.92)", tabBar:"rgba(15,21,32,0.95)",
    qualified:"rgba(201,209,217,0.08)",
    r:6, r2:10,
  },
};

// Legacy id map — keeps users with older localStorage values working.
// Default landing theme is now 'paris-indoor' (was 'grass') so any
// retired or unrecognised id maps onto the new default.
// V1 is locked to a single editorial look — every legacy theme id
// (and every unknown id) silently aliases to `editorial`. The map is
// kept so old localStorage values don't error; new code shouldn't
// ever set anything other than `editorial`.
var LEGACY_THEME_ALIASES = {
  wimbledon: "editorial",
  ao: "editorial",
  "french-open": "editorial",
  "us-open": "editorial",
  "desert-open": "editorial",
  "oceanside":   "editorial",
  "plaza-roja":  "editorial",
  "foro":        "editorial",
  "queen-city":  "editorial",
  "bund":        "editorial",
  // Former first-class themes — now all roll into editorial.
  "grass":        "editorial",
  "hard-court":   "editorial",
  "clay":         "editorial",
  "night-court":  "editorial",
  "riviera":      "editorial",
  "maple":        "editorial",
  "paris-indoor": "editorial",
};

export function normaliseThemeId(id) {
  // V1 single-look: anything that isn't literally "editorial" maps to
  // editorial. Existing callers that pass legacy ids stay valid.
  if (id === "editorial") return "editorial";
  return "editorial";
}

export function isValidThemeId(/* id */) {
  // V1 single-look — any id is now treated as valid (it'll be
  // normalised to editorial).
  return true;
}

export function makeTheme(/* themeName */) {
  // V1 single-look — always return the editorial tokens regardless
  // of input. Keeping the function signature so existing callers
  // (App.jsx, V2, tests) still work.
  return THEMES["editorial"];
}

// Single id list — V1 is locked to one look.
export var THEME_IDS = ["editorial"];

// Picker option list retained as a single-entry array so any code
// that iterates it (e.g. the settings picker, which has been
// removed) keeps rendering at most one swatch and doesn't crash.
export var THEME_OPTIONS = [
  { id: "editorial", label: "Editorial", swatch: "#2A201A", bg: "#F0E9DA" },
];

export function inputStyle(t) {
  return {
    width:"100%", padding:"12px 14px",
    borderRadius:t.r, border:"1px solid "+t.border,
    background:t.inputBg, color:t.text, fontSize:14,
    letterSpacing:"0.01em",
    transition:"border-color 0.2s"
  };
}
