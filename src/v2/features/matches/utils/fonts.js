// fonts.js — Idempotent font + base CSS injection for the v2 tennis
// design. Loads Instrument Serif (display headlines), Inter (UI), and
// JetBrains Mono (scoreboard numerals) from Google Fonts and injects
// the small set of utility classes the design uses (.t-serif, .t-cap,
// .t-num, .t-pulse, .t-ring keyframe, etc.).
//
// Idempotent: safe to call from every v2 surface — checks the DOM for
// an existing tag before injecting. Only mounted by v2 components, so
// the rest of the app stays untouched.

const FONTS_ID = "v2-tennis-fonts";
const STYLE_ID = "v2-tennis-base";

export function ensureFonts() {
  if (typeof document === "undefined") return;

  if (!document.getElementById(FONTS_ID)) {
    const link = document.createElement("link");
    link.id = FONTS_ID;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .t-serif { font-family: 'Instrument Serif', 'Times New Roman', serif; font-weight: 400; letter-spacing: -0.01em; }
      .t-sans  { font-family: 'Inter', -apple-system, system-ui, sans-serif; }
      .t-mono  { font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
      .t-tnum  { font-variant-numeric: tabular-nums; }
      .t-num   { font-family: 'JetBrains Mono', 'SF Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; font-feature-settings: 'tnum'; }
      .t-cap   { font-family: 'Inter', sans-serif; font-weight: 600; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; }
      .t-card  { border-radius: 14px; }
      .t-btn   { -webkit-tap-highlight-color: transparent; user-select: none; cursor: pointer; }
      .t-noscroll::-webkit-scrollbar { display: none; }
      .t-noscroll { scrollbar-width: none; }
      @keyframes t-pulse { 0%,100% { opacity: 1 } 50% { opacity: .35 } }
      .t-pulse { animation: t-pulse 1.6s ease-in-out infinite; }
      @keyframes t-ring { 0% { transform: scale(.85); opacity: 1 } 100% { transform: scale(1.6); opacity: 0 } }
    `;
    document.head.appendChild(style);
  }
}
