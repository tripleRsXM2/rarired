// src/v2/data/format.js
//
// Lightweight v2 data shapers. No v1 feature imports — these helpers
// only touch primitives (Date, Number, String) so the v2 namespace
// stays isolated from src/features/. Mirrors the score-formatting +
// relative-date rules the v1 codebase uses, expressed cleanly here.

// Format a sets array (DB shape: [{ you, them, you_tb, them_tb }, …])
// into the v2 score string "6-2 7-6 (10-8)". Tiebreak parens only
// render when both halves are populated. The DB always stores sets in
// the submitter's frame, so the caller is responsible for swapping
// you/them when the viewer is the opponent.
export function formatSetsV2(sets) {
  if (!Array.isArray(sets) || sets.length === 0) return "";
  return sets
    .map(function (s) {
      var a = s && s.you  != null ? String(s.you)  : "";
      var b = s && s.them != null ? String(s.them) : "";
      if (a === "" || b === "") return "";
      var head = a + "-" + b;
      var tbA = s && s.you_tb;
      var tbB = s && s.them_tb;
      if (tbA != null && tbB != null && tbA !== "" && tbB !== "") {
        head += " (" + tbA + "-" + tbB + ")";
      }
      return head;
    })
    .filter(Boolean)
    .join(" ");
}

// Render a match date as the v2 HomeScreen/HistoryScreen expects:
// "Today", "Yesterday", or "Sat · May 2" / "Tue · Apr 28" for older
// rows. Falls back to a localised long-date when the input is null.
export function formatRelDate(dateInput) {
  if (!dateInput) return "—";
  var d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "—";

  var now = new Date();
  var startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var startOfDate  = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var dayDiff = Math.round((startOfToday - startOfDate) / 86400000);

  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  // Within the past week, render "Sat · May 2"
  if (dayDiff > 1 && dayDiff < 8) {
    return d.toLocaleDateString(undefined, { weekday: "short" }) +
      " · " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  // Older — short month + day, drop the weekday
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Build a stable surface key for the v2 CourtMini icon from a raw
// venue / court / surface hint. The CourtMini component looks up
// COURTS["hard"|"clay"|"grass"|"blue"]; anything we don't recognise
// falls back to "hard" so the icon always renders.
export function deriveSurfaceKey(input) {
  var s = (input || "").toString().toLowerCase();
  if (!s) return "hard";
  if (s.indexOf("clay") >= 0) return "clay";
  if (s.indexOf("grass") >= 0) return "grass";
  if (s.indexOf("blue") >= 0)  return "blue";
  return "hard";
}

// Compose a humanised "on-court time" for the This Week stat tile.
// We don't store match duration in the DB (yet) — estimate from match
// count using a coarse per-match avg, mirroring the SAMPLE_HISTORY
// prototype. Tuned at ~1h 20m per match (rough singles best-of-3
// average). Caller can plug a real duration aggregate later.
export function estimateOnCourtTime(matchCount) {
  if (!matchCount) return "0h";
  var minutesTotal = matchCount * 80; // ~80 min per match
  var h = Math.floor(minutesTotal / 60);
  var m = minutesTotal % 60;
  if (h === 0) return m + "m";
  if (m === 0) return h + "h";
  return h + "h " + (m < 10 ? "0" + m : m) + "m";
}

// True when `dateInput` falls within the last 7 calendar days (inclusive
// of today). Used to derive the This Week stats from the full history.
export function isWithinLast7Days(dateInput) {
  if (!dateInput) return false;
  var d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return false;
  var now = new Date();
  var sevenAgo = new Date(now.getTime() - 7 * 86400000);
  return d.getTime() >= sevenAgo.getTime();
}
