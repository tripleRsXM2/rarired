// sampleMatches.js — Live + finished mock-match factories shared by the
// v2 BaselineApp shell. Lifted from the design's
// `Baseline App - Modern.html` `buildLiveMatch` / `buildFinishedMatch`
// helpers. The engine mutates in place so we keep these as factories
// — call once, store in a ref, mutate via `addPoint` / `undo`.

import { newMatch, addPoint } from "../utils/tennisEngine.js";

export function buildLiveMatch(p1Name = "You", p2Name = "M. Carter", format = "bo3") {
  const m = newMatch({ format, p1: { name: p1Name }, p2: { name: p2Name } });
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
  // set 3 — current state
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  // current game 30-15
  addPoint(m, 0); addPoint(m, 1); addPoint(m, 0);
  m.startedAt = Date.now() - 1000 * 60 * 84;
  m.stats.aces    = [4, 2];
  m.stats.winners = [18, 14];
  m.stats.errors  = [9, 11];
  return m;
}

export function buildFinishedMatch(p1Name = "You", p2Name = "M. Carter") {
  const m = newMatch({ format: "bo3", p1: { name: p1Name }, p2: { name: p2Name } });
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) addPoint(m, 0);
    for (let j = 0; j < 4; j++) addPoint(m, 1);
  }
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) addPoint(m, 0);
    for (let j = 0; j < 4; j++) addPoint(m, 1);
  }
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 1);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  for (let j = 0; j < 4; j++) addPoint(m, 0);
  m.stats.aces    = [7, 4];
  m.stats.winners = [32, 24];
  m.stats.errors  = [18, 22];
  m.startedAt = Date.now() - 1000 * 60 * 124;
  m.endedAt   = Date.now() - 1000 * 60 * 60 * 24;
  return m;
}
