// src/features/rating/components/SkillLevelPicker.jsx
//
// Reusable skill-level picker used by:
//   1. OnboardingModal step 1 — first-run skill choice + lock warning
//   2. (future) "Set skill level" prompt for users whose profile predates
//      the rating module and never ran initialize_rating
//
// Editorial vocabulary: hairline-divided list of 6 levels, each with
// the canonical description from copy + a tiny rating "starts at X"
// chip on the right so users see what they're choosing.

import { useState } from "react";
import {
  SKILL_LEVELS,
  SKILL_LEVEL_DESCRIPTIONS,
  RATING_BANDS,
} from "../constants.js";
import { LOCK_WARNING } from "../copy.js";
import RatingInfoIcon from "./RatingInfoIcon.jsx";
import { track } from "../../../lib/analytics.js";

function startingRatingFor(skill) {
  var band = RATING_BANDS.find(function (b) { return b.skill === skill; });
  return band ? band.start : null;
}

export default function SkillLevelPicker({
  t,
  value,           // currently selected skill ('' / null = none)
  onChange,        // (skill) => void
  onConfirm,       // optional — () => void; renders a Confirm button when provided
  showLockWarning, // boolean — render the lock-warning strip above Confirm
  busy,            // boolean — disables Confirm + dims the picker
}) {
  var [touched, setTouched] = useState(false);

  function pick(skill) {
    setTouched(true);
    if (onChange) onChange(skill);
    if (track) track("skill_level_selected", { skill: skill });
  }

  return (
    <div style={{ opacity: busy ? 0.6 : 1 }}>
      <div style={{
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <label style={{
          fontSize: 10, fontWeight: 800, letterSpacing: "0.12em",
          textTransform: "uppercase", color: t.textSecondary,
        }}>
          Starting skill level
        </label>
        <RatingInfoIcon t={t} size={14} label="onboarding"/>
      </div>

      <div style={{ borderTop: "1px solid " + t.border }}>
        {SKILL_LEVELS.map(function (s) {
          var on = value === s;
          var startRating = startingRatingFor(s);
          return (
            <button key={s}
              type="button"
              onClick={function () { pick(s); }}
              disabled={busy}
              style={{
                width: "100%", textAlign: "left",
                padding: "13px 14px",
                borderRadius: 0, border: "none",
                borderBottom: "1px solid " + t.border,
                borderLeft: "2px solid " + (on ? t.text : "transparent"),
                background: on ? t.accentSubtle : "transparent",
                color: t.text,
                cursor: busy ? "default" : "pointer",
                display: "flex", alignItems: "center", gap: 12,
              }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 14, fontWeight: 800, letterSpacing: "-0.2px",
                  marginBottom: 4,
                }}>{s}</div>
                <div style={{
                  fontSize: 11, color: on ? t.textSecondary : t.textTertiary,
                  fontWeight: 500, lineHeight: 1.4, letterSpacing: "-0.1px",
                }}>
                  {SKILL_LEVEL_DESCRIPTIONS[s] || ""}
                </div>
              </div>
              <div style={{
                flexShrink: 0, textAlign: "right",
                fontVariantNumeric: "tabular-nums",
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: t.textTertiary, marginBottom: 2,
                }}>Starts at</div>
                <div style={{
                  fontSize: 16, fontWeight: 800, color: t.text,
                  letterSpacing: "-0.3px", lineHeight: 1,
                }}>
                  {startRating}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {showLockWarning && (
        <div style={{
          marginTop: 16,
          paddingTop: 14, paddingBottom: 14,
          borderTop: "1px solid " + t.border,
          borderBottom: "1px solid " + t.border,
          display: "flex", flexDirection: "column", gap: 6,
        }}>
          <div style={{
            fontSize: 9, fontWeight: 800, letterSpacing: "0.16em",
            textTransform: "uppercase", color: t.orange,
          }}>
            Lock warning
          </div>
          <div style={{
            fontSize: 12, color: t.text, lineHeight: 1.5,
            letterSpacing: "-0.1px",
          }}>
            {LOCK_WARNING}
          </div>
        </div>
      )}

      {onConfirm && (
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || !value}
          style={{
            marginTop: 16,
            width: "100%", padding: "14px",
            borderRadius: 10, border: "none",
            background: (busy || !value) ? t.border : t.accent,
            color: "#fff",
            fontSize: 11, fontWeight: 800,
            letterSpacing: "0.12em", textTransform: "uppercase",
            cursor: (busy || !value) ? "not-allowed" : "pointer",
          }}>
          {busy ? "Saving…" : "Confirm starting level"}
        </button>
      )}

      {!touched && !value && (
        <div style={{
          marginTop: 10, fontSize: 11, color: t.textTertiary,
          letterSpacing: "-0.1px",
        }}>
          Tap a level above to choose your starting point.
        </div>
      )}
    </div>
  );
}
