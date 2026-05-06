// tokens.js — design tokens, theme presets, court color presets.
// Ported faithfully from the v2 Claude Design `tokens.jsx`.
//
// Aesthetic: Wimbledon refinement × Apple Sports clarity × scoreboard
// precision. Three themes (paper / scoreboard / court) × five courts
// (grass / hard / clay / blue / mono).

export const COURTS = {
  grass: { name: "Grass",     surface: "#1a4d2e", surfaceLine: "#fefefe", accent: "#d4e84a", label: "Wimbledon" },
  hard:  { name: "Hard",      surface: "#2a4dac", surfaceLine: "#fefefe", accent: "#b9e85a", label: "US Open" },
  clay:  { name: "Clay",      surface: "#c45a3e", surfaceLine: "#fefefe", accent: "#f4e6c0", label: "Roland Garros" },
  blue:  { name: "Blue Hard", surface: "#0f3a6b", surfaceLine: "#fefefe", accent: "#3ec8d4", label: "Australian" },
  mono:  { name: "Mono",      surface: "#0f1410", surfaceLine: "#e8e6df", accent: "#d4e84a", label: "Studio" },
};

export const THEMES = {
  paper: {
    name: "Paper",
    bg: "#f5efe0",
    bgRaised: "#fbf6e9",
    ink: "#1c2118",
    inkSoft: "#5a5a4e",
    inkFaint: "rgba(28,33,24,0.4)",
    line: "rgba(28,33,24,0.12)",
    lineStrong: "rgba(28,33,24,0.24)",
    chip: "rgba(28,33,24,0.06)",
    scoreBg: "#0f1410",
    scoreInk: "#e8e6df",
    scoreInkActive: "#d4e84a",
  },
  scoreboard: {
    name: "Scoreboard",
    bg: "#0f1410",
    bgRaised: "#1a201b",
    ink: "#e8e6df",
    inkSoft: "rgba(232,230,223,0.65)",
    inkFaint: "rgba(232,230,223,0.35)",
    line: "rgba(232,230,223,0.10)",
    lineStrong: "rgba(232,230,223,0.20)",
    chip: "rgba(232,230,223,0.08)",
    scoreBg: "#0a0e0b",
    scoreInk: "#e8e6df",
    scoreInkActive: "#d4e84a",
  },
  court: {
    name: "Court",
    bg: "#1a4d2e",
    bgRaised: "#225a38",
    ink: "#fbf6e9",
    inkSoft: "rgba(251,246,233,0.7)",
    inkFaint: "rgba(251,246,233,0.4)",
    line: "rgba(251,246,233,0.15)",
    lineStrong: "rgba(251,246,233,0.28)",
    chip: "rgba(251,246,233,0.10)",
    scoreBg: "#0f3920",
    scoreInk: "#fbf6e9",
    scoreInkActive: "#d4e84a",
  },
};
