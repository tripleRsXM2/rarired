// modernTokens.js — Modern look variant of the v2 design tokens.
// Ported faithfully from the design's `modern-tokens.jsx`.
//
// Aesthetic: monochrome, sleek, sharp corners, mono caps, neon-lime
// accent. Pairs with `tokens.js` (Classic). The BaselineApp shell flips
// between the two via the Appearance toggle on the Home screen and
// applies a one-off `<style>` overlay for the typography/border-radius
// tweaks that the design `MODERN_CSS` block carries.

export const MODERN_THEMES = {
  paper: {
    name: "Sheet",
    bg: "#ffffff", bgRaised: "#fafafa", ink: "#0a0a0a",
    inkSoft: "#525252", inkFaint: "#a3a3a3",
    line: "#e5e5e5", lineStrong: "#d4d4d4", chip: "#f4f4f4",
    scoreBg: "#0a0a0a", scoreInk: "#ffffff", scoreInkActive: "#c4ec3f",
    courtAccent: "#c4ec3f",
  },
  scoreboard: {
    name: "Carbon",
    bg: "#0a0a0a", bgRaised: "#161616", ink: "#fafafa",
    inkSoft: "#a3a3a3", inkFaint: "#525252",
    line: "#262626", lineStrong: "#404040", chip: "#1f1f1f",
    scoreBg: "#c4ec3f", scoreInk: "#0a0a0a", scoreInkActive: "#c4ec3f",
    courtAccent: "#c4ec3f",
  },
  court: {
    name: "Court",
    bg: "#f4f5f0", bgRaised: "#ffffff", ink: "#0c1410",
    inkSoft: "#3f4a42", inkFaint: "#869089",
    line: "#dfe2db", lineStrong: "#c8ccc4", chip: "#eaece4",
    scoreBg: "#0c1410", scoreInk: "#fafafa", scoreInkActive: "#c4ec3f",
    courtAccent: "#c4ec3f",
  },
};

export const MODERN_COURTS = {
  grass: { name: "Grass", surface: "#1f2d20", surfaceLine: "#fefefe", accent: "#c4ec3f", stripe: "#2a3a2a", label: "Grass" },
  hard:  { name: "Hard",  surface: "#1d3a8a", surfaceLine: "#fefefe", accent: "#60a5fa", stripe: "#1e3a8a", label: "Hard" },
  clay:  { name: "Clay",  surface: "#a13a1a", surfaceLine: "#fefefe", accent: "#fb923c", stripe: "#7c2d12", label: "Clay" },
  blue:  { name: "Blue",  surface: "#0c1a2a", surfaceLine: "#fefefe", accent: "#22d3ee", stripe: "#0c1a2a", label: "Blue" },
  mono:  { name: "Mono",  surface: "#0a0a0a", surfaceLine: "#fafafa", accent: "#fafafa", stripe: "#171717", label: "Mono" },
};

// CSS overlay applied while Modern look is active. Matches the
// design's MODERN_CSS exactly so that border-radius / type tweaks
// follow inline styles (which we can't easily override from JS).
const MODERN_CSS = `
  .v2-modern-root { --t-radius-sm: 2px; --t-radius-md: 4px; --t-radius-lg: 6px; }
  .v2-modern-root .t-serif {
    font-family: 'Inter', 'Helvetica Neue', system-ui, sans-serif !important;
    font-weight: 700 !important; letter-spacing: -0.04em !important; font-style: normal !important;
  }
  .v2-modern-root .t-serif em { font-style: normal !important; font-weight: 400 !important; color: inherit !important; opacity: 0.5; }
  .v2-modern-root .t-cap {
    font-family: 'JetBrains Mono', ui-monospace, monospace !important;
    font-weight: 500 !important; font-size: 10px !important;
    letter-spacing: 0.04em !important; text-transform: uppercase !important;
  }
  .v2-modern-root .t-num { font-family: 'JetBrains Mono', ui-monospace, monospace !important; font-feature-settings: 'tnum' !important; }
  .v2-modern-root .t-btn { border-radius: 4px !important; transition: background 120ms ease, border-color 120ms ease; }
`;

const STYLE_ID = "v2-modern-overrides";

export function ensureModernCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = MODERN_CSS;
  document.head.appendChild(tag);
}
