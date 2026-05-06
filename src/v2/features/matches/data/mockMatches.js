// mockMatches.js — Mock match-state factories used to seed the V2 Live
// Scoring "key states" preview (Deuce, Tiebreak, Match Point). Ported
// from the v2 Claude Design `Tennis Match UI.html` (lines 350-380) plus
// the upstream `buildSampleMatch` helper.
//
// Each factory returns a fresh, mutable match object via the engine —
// taps in the UI keep working because the engine mutates in place.
// When real Supabase persistence is added, swap these factories for a
// fetch by match-id; the UI only cares about match shape.

import { newMatch, addPoint } from "../utils/tennisEngine.js";

const DEFAULTS = { p1Name: "You", p2Name: "M. Carter", format: "bo3" };

// 2 sets played (6-4, 3-6); current set 4-3 with the next game in
// motion at 30-40 — gives the design something rich to render.
function buildSampleMatch(t = DEFAULTS) {
  const m = newMatch({ format: t.format || "bo3", p1: { name: t.p1Name }, p2: { name: t.p2Name } });
  // set 1 — p1 wins 6-4
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) addPoint(m, 0);
    for (let j = 0; j < 4; j++) addPoint(m, 1);
  }
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  // set 2 — p2 wins 6-3
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) addPoint(m, 1);
  // set 3 — current 4-3, 30-40, p1 serving
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  // current game: 30-40
  addPoint(m, 1); addPoint(m, 1); addPoint(m, 0); addPoint(m, 0); addPoint(m, 1);
  m.startedAt = Date.now() - 1000 * 60 * 84;
  m.stats.aces = [4, 2];
  m.stats.winners = [18, 14];
  m.stats.errors = [9, 11];
  return m;
}

export function makeDeuce(t = DEFAULTS) {
  const m = buildSampleMatch(t);
  m.points = [3, 3];
  return m;
}

export function makeTiebreak(t = DEFAULTS) {
  const m = newMatch({ format: "bo3", p1: { name: t.p1Name }, p2: { name: t.p2Name } });
  // set 1 → 6-3
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) addPoint(m, 0);
    for (let j = 0; j < 4; j++) addPoint(m, 1);
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) addPoint(m, 0);
  // set 2 → 6-6, then tiebreak
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) addPoint(m, 0);
    for (let j = 0; j < 4; j++) addPoint(m, 1);
  }
  m.tbPoints = [5, 4];
  m.startedAt = Date.now() - 1000 * 60 * 92;
  m.stats.aces = [6, 3];
  return m;
}

export function makeMatchPoint(t = DEFAULTS) {
  const m = newMatch({ format: "bo3", p1: { name: t.p1Name }, p2: { name: t.p2Name } });
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) addPoint(m, 0);
    for (let j = 0; j < 4; j++) addPoint(m, 1);
  }
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  // set 2 → 5-3
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) addPoint(m, 0);
    for (let j = 0; j < 4; j++) addPoint(m, 1);
  }
  for (let i = 0; i < 2; i++) for (let j = 0; j < 4; j++) addPoint(m, 0);
  // current game 40-15 (next pt = match)
  addPoint(m, 0); addPoint(m, 0); addPoint(m, 1); addPoint(m, 0);
  m.startedAt = Date.now() - 1000 * 60 * 71;
  m.stats.aces = [5, 1];
  return m;
}

export const KEY_STATES = [
  { id: "deuce",      label: "Deuce",       factory: makeDeuce },
  { id: "tiebreak",   label: "Tiebreak",    factory: makeTiebreak },
  { id: "matchpoint", label: "Match point", factory: makeMatchPoint },
];
