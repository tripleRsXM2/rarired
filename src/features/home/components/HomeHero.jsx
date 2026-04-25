// src/features/home/components/HomeHero.jsx
//
// Visual reset v2: the Home Hero is no longer a card. It's a borderless
// editorial composition that lives directly on the page background —
// generous breathing room, display-sized hero metric, hairline divider
// instead of a frame.
//
// Composition (top → bottom):
//   1. Greeting line — "Good evening, {name}" at editorial scale
//   2. Display metric — ranking_points at 88-96px desktop / 56-72px
//      mobile. The largest thing on the screen. Tabular nums, tight
//      tracking, weight 800.
//   3. Caption row — "Ranking points · Suburb · Skill" as a single
//      quiet line, NOT three pills.
//   4. Recent form chips — sharp horizontal sequence (up to 5 W/L),
//      placed below the metric, not next to it.
//   5. Single trust signal (provisional / confirmed) — one quiet line
//      of meta, no pill chrome.
//
// Empty state (zero confirmed matches): same composition, but the
// display number is replaced by a welcoming statement and the caption
// nudges the user toward logging their first match.
//
// Per docs/design-direction.md → Visual reset (v2).

import { displayLocation } from "../../../lib/utils/avatar.js";
import {
  computeRecentForm,
  formatConfirmedBadge,
  provisionalLabel,
  calibrationProgressLabel,
} from "../../profile/utils/profileStats.js";
import RatingInfoIcon from "../../rating/components/RatingInfoIcon.jsx";

function greeting() {
  var h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function trustLine(t, profile) {
  var prov = provisionalLabel(profile);
  if (prov) return { text: prov, color: t.orange };
  var confirmed = formatConfirmedBadge(profile);
  if (confirmed) return { text: confirmed, color: t.textTertiary };
  return null;
}

export default function HomeHero({ t, profile, history }) {
  if (!profile) return null;

  var played       = profile.matches_played != null ? profile.matches_played : 0;
  var hasMatches   = played > 0;
  // Module 7.7: only show a rating once initialise_rating has run.
  var ratingInitialised = profile.initial_rating != null;
  var rankPts      = profile.ranking_points != null ? profile.ranking_points : null;
  var recentForm   = computeRecentForm(history || [], 5);
  var location     = displayLocation(profile);
  var trust        = trustLine(t, profile);
  var calibLabel   = calibrationProgressLabel(profile);
  var firstName    = (profile.name || "").split(" ")[0] || profile.name;

  return (
    <div className="cs-home-hero">
      {/* Greeting — editorial scale, not a header */}
      <div className="cs-home-hero-greeting" style={{
        fontSize: "clamp(22px, 3.4vw, 32px)",
        fontWeight: 400,
        color: t.textSecondary,
        letterSpacing: "-0.4px",
        lineHeight: 1.15,
      }}>
        {greeting()}{firstName ? ", " : ""}<span style={{ color: t.text, fontWeight: 600 }}>{firstName || "player"}</span>
      </div>

      {/* Display metric — the largest thing on the screen by a wide margin.
          clamp() keeps it generous on desktop and proportional on phones
          without needing media queries here. */}
      <div className="cs-home-hero-metric" style={{ marginTop: "clamp(20px, 3vw, 32px)" }}>
        {ratingInitialised && rankPts != null ? (
          /* Inline-flex so the info icon sits as a superscript at the
             top-right of the numeral instead of in the caption row. */
          <div style={{ display: "inline-flex", alignItems: "flex-start", gap: 4 }}>
            <div style={{
              fontSize: "clamp(56px, 11vw, 96px)",
              fontWeight: 800,
              color: t.text,
              letterSpacing: "-0.04em",
              lineHeight: 0.95,
              fontVariantNumeric: "tabular-nums",
            }}>
              {rankPts.toLocaleString()}
            </div>
            <span style={{ marginTop: "0.4em", flexShrink: 0 }}>
              <RatingInfoIcon t={t} size={16} label="home_hero"/>
            </span>
          </div>
        ) : (
          <div style={{
            fontSize: "clamp(28px, 5vw, 44px)",
            fontWeight: 700,
            color: t.text,
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            maxWidth: 520,
          }}>
            Welcome to your tennis identity.
          </div>
        )}
      </div>

      {/* Caption row — rating eyebrow + meta. Info icon now sits as a
          superscript next to the rating number (above), so the row is
          just text. */}
      <div className="cs-home-hero-caption" style={{
        marginTop: 14,
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
      }}>
        {ratingInitialised && rankPts != null ? (
          <>
            <span style={{
              fontSize: 10, fontWeight: 800,
              color: t.textTertiary, letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}>
              CourtSync Rating
            </span>
            {(location || profile.skill) && (
              <span style={{
                fontSize: 12, fontWeight: 500,
                color: t.textTertiary, letterSpacing: "0.01em",
              }}>
                ·  {[location, profile.skill].filter(Boolean).join("  ·  ")}
              </span>
            )}
          </>
        ) : (
          <span style={{
            fontSize: 13, fontWeight: 500,
            color: t.textTertiary, letterSpacing: "0.01em",
          }}>
            {hasMatches
              ? "Pick a starting skill level to get your CourtSync Rating."
              : "Log your first match to start tracking your form."}
          </span>
        )}
      </div>

      {calibLabel && ratingInitialised && (
        <div style={{
          marginTop: 8,
          fontSize: 10, fontWeight: 800,
          color: t.orange, letterSpacing: "0.16em",
          textTransform: "uppercase",
        }}>
          {calibLabel}
        </div>
      )}

      {/* Recent form — sharp horizontal sequence, only when we have history */}
      {hasMatches && recentForm.length > 0 && (
        <div className="cs-home-hero-form" style={{ marginTop: 28, display: "flex", gap: 5 }}>
          {recentForm.map(function (r, i) {
            var isW = r === "W";
            return (
              <span key={i} style={{
                width: 26, height: 26,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 12, fontWeight: 800,
                color: isW ? t.green : t.red,
                background: "transparent",
                border: "1.5px solid " + (isW ? t.green : t.red),
                borderRadius: 0,
                letterSpacing: "0.02em",
              }}>{r}</span>
            );
          })}
        </div>
      )}

      {/* Trust line — one quiet caption, no pill */}
      {trust && (
        <div style={{
          marginTop: 22,
          fontSize: 11,
          fontWeight: 700,
          color: trust.color,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}>
          {trust.text}
        </div>
      )}
    </div>
  );
}
