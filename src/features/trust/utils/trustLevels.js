// src/features/trust/utils/trustLevels.js
//
// Module 10 (Slice 2) — pure copy + visibility rules for trust badges.
//
// Single source of truth for what each public_badge value means in the
// UI layer. The DB-side spec lives in docs/player-trust-and-reliability.md;
// this file translates those canonical values into label/color/visibility.
//
// Rules in this file (all enforced via tests):
//   - Visibility: ONLY 'responsive', 'reliable', 'confirmed' badges
//     surface publicly. 'new' and 'building' deliberately render no
//     badge — absence-of-positive is the worst public signal.
//   - No public negative labels. There is no 'flagged' or 'unreliable'
//     value in the canonical list.
//   - Tone: every label is positive or neutral. No icons that could
//     read as warnings. Badges are calm, low-saturation chrome.
//   - Size: badges are intentionally small (font 9–10px, padding 2–6px)
//     so they don't compete with the player's name or the score.

// Canonical badge values produced by recalculate_player_trust_profile.
// Keep this list in lockstep with the CHECK constraint in the migration.
export var BADGE_VALUES = ["new", "building", "responsive", "reliable", "confirmed"];

// Public-render gate. Returns true ONLY for badges we want shown
// next to a player name in feed / profile / discovery.
//
// 'new' and 'building' return false: a brand-new account or one
// with limited history shouldn't carry a chip. Discoverability
// signal is "have I shown enough activity" — hiding the badge IS
// the signal.
export function shouldShowBadgePublic(badge) {
  return badge === "responsive" || badge === "reliable" || badge === "confirmed";
}

// Human-readable label for each badge. Short on purpose — fits in
// FeedCard chip + ProfileHero subtitle without truncation.
export function badgeLabel(badge) {
  switch (badge) {
    case "confirmed":  return "Confirmed";
    case "reliable":   return "Reliable";
    case "responsive": return "Responsive";
    // Below the public-visibility line — labels exist for self-view /
    // analytics / future surfaces, not for cross-user rendering.
    case "building":   return "Building history";
    case "new":        return "New player";
    default:           return "";
  }
}

// One-line description, used as a tooltip / sub-line on the
// profile detail surface. Speak to the user, not about them.
export function badgeDescription(badge) {
  switch (badge) {
    case "confirmed":
      return "Has 10+ confirmed ranked matches with a clean dispute history.";
    case "reliable":
      return "Strong response and follow-through across enough matches to count.";
    case "responsive":
      return "Reliably responds to challenges and invites within a day.";
    case "building":
      return "Their CourtSync history is getting going.";
    case "new":
      return "Just joined CourtSync — no signals yet.";
    default:
      return "";
  }
}

// Resolve an accent color token from the theme. Single-source so the
// FeedCard chip + ProfileHero badge match without copy-pasting hex.
// Pass the active theme `t` from makeTheme(). Returns the muted-text
// color for everything except 'confirmed', which earns the accent.
export function badgeColor(t, badge) {
  if (!t) return null;
  switch (badge) {
    case "confirmed":  return t.accent;
    case "reliable":   return t.text;
    case "responsive": return t.textSecondary;
    case "building":
    case "new":
    default:           return t.textTertiary;
  }
}
