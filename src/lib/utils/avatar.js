// src/lib/utils/avatar.js
// Generic avatar helpers: deterministic colour from name + initials extractor.
import { AV_COLORS } from "../constants/ui.js";

export function avColor(name) {
  return AV_COLORS[(name||"A").charCodeAt(0) % AV_COLORS.length];
}

export function initials(name) {
  return (name||"?").split(" ").map(function(w){return w[0];}).join("").slice(0,2).toUpperCase();
}
